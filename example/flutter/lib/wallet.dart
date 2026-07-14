/// wallet.dart — native mobile wallet signing for the Cherry Chat embed.
///
/// The embed's `signChallenge` step needs a raw Ed25519 signature over the
/// challenge bytes the Cherry server generates. On mobile the wallet lives in
/// the native layer:
///
///   - Android → Mobile Wallet Adapter (MWA) via `solana_mobile_client`
///   - iOS     → deeplink to Phantom (no MWA on iOS yet)
///
/// Contract (both platforms):
///   - `connectWallet()`            → the wallet's base58 public key.
///   - `signMessageWithWallet(b)`   → the 64-byte Ed25519 signature over `b`
///                                    AS-IS (no re-hash, no prefix). Cherry
///                                    verifies ed25519.verify(sig, b, pubkey).
///
/// NOTE: exact APIs of `solana_mobile_client`, `pinenacl`, `bs58`, and
/// `app_links` vary by version — verify against the versions you install
/// (see pubspec.yaml). The Phantom deeplink protocol is documented at
/// https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android.

import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';

// Android — Mobile Wallet Adapter
import 'package:solana_mobile_client/solana_mobile_client.dart';

// iOS — Phantom deeplink crypto
import 'package:pinenacl/x25519.dart';
import 'package:bs58/bs58.dart';
import 'package:url_launcher/url_launcher.dart';

// ── Your app identity (shown in the wallet's connect prompt) ────────────────
final Uri _appUri = Uri.parse('https://yoursite.com');
const String _appName = 'My App';
// iOS: your app's custom URL scheme that Phantom redirects back to. Register it
// in Info.plist (CFBundleURLTypes) and route incoming links via app_links.
const String _iosRedirectScheme = 'mydapp';

// ═══════════════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════════════

Future<String> connectWallet() {
  if (defaultTargetPlatform == TargetPlatform.android) return _androidConnect();
  if (defaultTargetPlatform == TargetPlatform.iOS) return _phantom.connect();
  throw UnsupportedError('connectWallet: unsupported platform');
}

Future<Uint8List> signMessageWithWallet(Uint8List message) {
  if (defaultTargetPlatform == TargetPlatform.android) return _androidSign(message);
  if (defaultTargetPlatform == TargetPlatform.iOS) return _phantom.signMessage(message);
  throw UnsupportedError('signMessageWithWallet: unsupported platform');
}

/// iOS ONLY: wire this into your `app_links` listener so Phantom's redirect
/// resolves the pending connect/sign. Example:
///   AppLinks().uriLinkStream.listen(handleWalletDeeplink);
void handleWalletDeeplink(Uri uri) => _phantom.handleResponse(uri);

// ═══════════════════════════════════════════════════════════════════════════
//  Android — Mobile Wallet Adapter
// ═══════════════════════════════════════════════════════════════════════════

String? _androidAuthToken;
Uint8List? _androidPubkey;

Future<String> _androidConnect() async {
  final result = await _androidTransact((client) async {
    final auth = await client.authorize(
      identityUri: _appUri,
      iconUri: Uri.parse('favicon.ico'),
      identityName: _appName,
      cluster: 'mainnet-beta',
    );
    if (auth == null) throw StateError('MWA authorize declined');
    _androidAuthToken = auth.authToken;
    _androidPubkey = auth.publicKey;
    return base58.encode(auth.publicKey);
  });
  return result;
}

Future<Uint8List> _androidSign(Uint8List message) async {
  return _androidTransact((client) async {
    // Reuse the prior session so the user isn't asked to connect again.
    if (_androidAuthToken != null) {
      await client.reauthorize(
        identityUri: _appUri,
        identityName: _appName,
        authToken: _androidAuthToken!,
      );
    } else {
      final auth = await client.authorize(
        identityUri: _appUri,
        iconUri: Uri.parse('favicon.ico'),
        identityName: _appName,
        cluster: 'mainnet-beta',
      );
      if (auth == null) throw StateError('MWA authorize declined');
      _androidAuthToken = auth.authToken;
      _androidPubkey = auth.publicKey;
    }

    final res = await client.signMessages(
      messages: [message],
      addresses: [_androidPubkey!],
    );
    final signed = res.signedPayloads.first;
    // MWA returns the message with the 64-byte signature appended; take the tail.
    return signed.length > 64
        ? Uint8List.fromList(signed.sublist(signed.length - 64))
        : signed;
  });
}

Future<T> _androidTransact<T>(Future<T> Function(MobileWalletAdapterClient) body) async {
  final scenario = await LocalAssociationScenario.create();
  scenario.startActivityForResult(null).ignore(); // opens the wallet app
  final client = await scenario.start();
  try {
    return await body(client);
  } finally {
    await scenario.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  iOS — Phantom deeplink (encrypted)
// ═══════════════════════════════════════════════════════════════════════════

final _PhantomDeeplink _phantom = _PhantomDeeplink();

class _PhantomDeeplink {
  static const _base = 'https://phantom.app/ul/v1';

  final _rng = Random.secure();

  PrivateKey? _dappKey; // our X25519 keypair for this session
  Box? _box; // shared-secret box with Phantom
  String? _session; // opaque session token from Phantom
  String? _address; // connected wallet (base58)

  Completer<String>? _connectC;
  Completer<Uint8List>? _signC;

  // ── connect ──────────────────────────────────────────────────────────────
  Future<String> connect() {
    if (_address != null) return Future.value(_address);
    _connectC = Completer<String>();

    _dappKey = PrivateKey.generate();
    final params = {
      'dapp_encryption_public_key': base58.encode(_dappKey!.publicKey.asTypedList),
      'cluster': 'mainnet-beta',
      'app_url': _appUri.toString(),
      'redirect_link': '$_iosRedirectScheme://onPhantomConnect',
    };
    _launch('$_base/connect', params);
    return _connectC!.future;
  }

  // ── signMessage ────────────────────────────────────────────────────────────
  Future<Uint8List> signMessage(Uint8List message) {
    if (_box == null || _session == null) {
      return Future.error(StateError('Phantom not connected — call connectWallet() first'));
    }
    _signC = Completer<Uint8List>();

    final payload = jsonEncode({
      'session': _session,
      'message': base58.encode(message),
    });
    final nonce = _randomBytes(24);
    final enc = _box!.encrypt(Uint8List.fromList(utf8.encode(payload)), nonce: nonce);

    final params = {
      'dapp_encryption_public_key': base58.encode(_dappKey!.publicKey.asTypedList),
      'nonce': base58.encode(Uint8List.fromList(enc.nonce)),
      'redirect_link': '$_iosRedirectScheme://onPhantomSign',
      'payload': base58.encode(Uint8List.fromList(enc.cipherText)),
    };
    _launch('$_base/signMessage', params);
    return _signC!.future;
  }

  // ── deeplink return handler (wired via app_links in main) ──────────────────
  void handleResponse(Uri uri) {
    final q = uri.queryParameters;
    if (q['errorCode'] != null) {
      final err = Exception('Phantom error ${q['errorCode']}: ${q['errorMessage']}');
      _connectC?.completeError(err);
      _signC?.completeError(err);
      return;
    }

    if (uri.host == 'onPhantomConnect' || uri.path.contains('onPhantomConnect')) {
      _onConnect(q);
    } else if (uri.host == 'onPhantomSign' || uri.path.contains('onPhantomSign')) {
      _onSign(q);
    }
  }

  void _onConnect(Map<String, String> q) {
    try {
      final phantomPub = base58.decode(q['phantom_encryption_public_key']!);
      _box = Box(myPrivateKey: _dappKey!, theirPublicKey: PublicKey(phantomPub));
      final decrypted = _box!.decrypt(
        ByteList(base58.decode(q['data']!)),
        nonce: base58.decode(q['nonce']!),
      );
      final data = jsonDecode(utf8.decode(decrypted)) as Map<String, dynamic>;
      _session = data['session'] as String;
      _address = data['public_key'] as String;
      _connectC?.complete(_address);
    } catch (e) {
      _connectC?.completeError(e);
    }
  }

  void _onSign(Map<String, String> q) {
    try {
      final decrypted = _box!.decrypt(
        ByteList(base58.decode(q['data']!)),
        nonce: base58.decode(q['nonce']!),
      );
      final data = jsonDecode(utf8.decode(decrypted)) as Map<String, dynamic>;
      final sig = base58.decode(data['signature'] as String); // 64-byte Ed25519
      _signC?.complete(Uint8List.fromList(sig));
    } catch (e) {
      _signC?.completeError(e);
    }
  }

  Future<void> _launch(String base, Map<String, String> params) {
    final uri = Uri.parse(base).replace(queryParameters: params);
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Uint8List _randomBytes(int n) =>
      Uint8List.fromList(List<int>.generate(n, (_) => _rng.nextInt(256)));
}
