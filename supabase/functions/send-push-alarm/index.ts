// supabase/functions/send-push-alarm/index.ts
// Sends a Web Push notification to a specific tablet slot via VAPID
// Deploy: supabase functions deploy send-push-alarm
// Set secret: supabase secrets set VAPID_PRIVATE_KEY=T4NJ3NycoQpd_Z-Jsqgn8-lGIeE7mIRDDXSFiBcG7UY

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = 'BMSt8upjLKu9uE7kB0lU9_sy8NYkYPTm7Eb9Dxg-9-8_k0ch_4ZTIfpxf0iXKT1Y_qtH1-Z1lL2KBALUyVICKCI';
const SUBJECT = 'mailto:admin@lanetrailers.com';

function base64urlDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function buildVapidJWT(audience: string, privateKeyB64url: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: object) =>
    base64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const header = encode({ alg: 'ES256', typ: 'JWT' });
  const payload = encode({ aud: audience, exp: now + 43200, sub: SUBJECT });
  const signingInput = `${header}.${payload}`;

  const rawPriv = base64urlDecode(privateKeyB64url);
  // Build a minimal PKCS#8 DER for P-256 private key
  // 30 41 - SEQUENCE
  //   02 01 00 - INTEGER version=0
  //   30 13 - SEQUENCE AlgorithmIdentifier
  //     06 07 2a86 48ce 3d02 01 - OID id-ecPublicKey
  //     06 08 2a86 48ce 3d03 0107 - OID prime256v1
  //   04 27 - OCTET STRING
  //     30 25 - SEQUENCE ECPrivateKey
  //       02 01 01 - INTEGER version=1
  //       04 20 <32 bytes privKey>
  const pkcs8 = new Uint8Array([
    0x30, 0x41,
    0x02, 0x01, 0x00,
    0x30, 0x13,
      0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
      0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    0x04, 0x27,
      0x30, 0x25,
      0x02, 0x01, 0x01,
      0x04, 0x20, ...rawPriv,
  ]);

  const ecKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    ecKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64urlEncode(new Uint8Array(sig))}`;
}

// ─── Encrypt payload with aes128gcm per RFC 8291 ─────────────────────────────
async function encryptPayload(
  subscription: { keys: { p256dh: string; auth: string } },
  payload: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const rawAuth = base64urlDecode(subscription.keys.auth);
  const rawP256dh = base64urlDecode(subscription.keys.p256dh);

  // Generate ephemeral key pair
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Export server public key (65-byte uncompressed)
  const ephemeralPublicDer = await crypto.subtle.exportKey('spki', ephemeral.publicKey);
  const serverPublicKey = new Uint8Array(ephemeralPublicDer).slice(-65);

  // Import subscriber's P-256DH public key
  const subKey = await crypto.subtle.importKey(
    'raw',
    rawP256dh,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subKey },
    ephemeral.privateKey,
    256
  );

  // HKDF to derive content encryption key and nonce
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const sharedKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveBits']);

  const prk_ikm = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveBits']);

  // key_info = "Content-Encoding: aes128gcm\0"
  const keyInfo = new Uint8Array([
    0x43, 0x6f, 0x6e, 0x74, 0x65, 0x6e, 0x74, 0x2d, 0x45, 0x6e, 0x63, 0x6f, 0x64, 0x69, 0x6e,
    0x67, 0x3a, 0x20, 0x61, 0x65, 0x73, 0x31, 0x32, 0x38, 0x67, 0x63, 0x6d, 0x00, 0x01,
  ]);

  // Derive prk using auth as salt over HKDF-SHA-256
  const prkKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array([...rawAuth]),
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  // auth_info = "Content-Encoding: auth\0"
  const authInfo = new TextEncoder().encode('Content-Encoding: auth\0');
  const prk = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: rawAuth, info: authInfo },
    await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveBits']),
    256
  );

  const prkForContent = await crypto.subtle.importKey('raw', prk, 'HKDF', false, ['deriveBits']);
  const contentKey = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: keyInfo },
    prkForContent,
    128
  );

  const nonceInfo = new Uint8Array([
    0x43, 0x6f, 0x6e, 0x74, 0x65, 0x6e, 0x74, 0x2d, 0x45, 0x6e, 0x63, 0x6f, 0x64, 0x69, 0x6e,
    0x67, 0x3a, 0x20, 0x6e, 0x6f, 0x6e, 0x63, 0x65, 0x00, 0x01,
  ]);
  const nonce = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo },
    prkForContent,
    96
  );

  const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, ['encrypt']);

  // Add padding: 2 bytes padding length (0) + payload + 1 byte delimiter (0x02)
  const plaintext = new TextEncoder().encode(payload);
  const padded = new Uint8Array(2 + plaintext.length + 1);
  padded[0] = 0;
  padded[1] = 0;
  padded.set(plaintext, 2);
  padded[2 + plaintext.length] = 0x02;

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    padded
  );

  return {
    ciphertext: new Uint8Array(encrypted),
    salt,
    serverPublicKey,
  };
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payloadStr: string,
  vapidPrivateKey: string
): Promise<{ ok: boolean; status: number }> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJWT(audience, vapidPrivateKey);
  const authHeader = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;

  let body: Uint8Array;
  let contentEncoding: string;
  let contentType: string;

  try {
    const { ciphertext, salt, serverPublicKey } = await encryptPayload(subscription, payloadStr);
    // Build aes128gcm content header: salt(16) + rs(4) + keyidlen(1) + keyid(65) + ciphertext
    const rs = 4096;
    const header = new Uint8Array(16 + 4 + 1 + 65);
    header.set(salt, 0);
    const rsView = new DataView(header.buffer);
    rsView.setUint32(16, rs, false);
    header[20] = 65;
    header.set(serverPublicKey, 21);
    body = new Uint8Array(header.length + ciphertext.length);
    body.set(header, 0);
    body.set(ciphertext, header.length);
    contentEncoding = 'aes128gcm';
    contentType = 'application/octet-stream';
  } catch {
    // Encryption failed — send plain JSON (works for some FCM endpoints)
    body = new TextEncoder().encode(payloadStr);
    contentEncoding = '';
    contentType = 'application/json';
  }

  const headers: Record<string, string> = {
    'Authorization': authHeader,
    'Content-Type': contentType,
    'TTL': '60',
  };
  if (contentEncoding) headers['Content-Encoding'] = contentEncoding;

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers,
    body,
  });

  return { ok: res.ok, status: res.status };
}

// ─── Edge Function Entry Point ────────────────────────────────────────────────
serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { target_slot, command, payload } = await req.json();
    if (!target_slot || !command) {
      return new Response(JSON.stringify({ error: 'target_slot and command are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!vapidPrivateKey) {
      return new Response(JSON.stringify({ error: 'VAPID_PRIVATE_KEY secret not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: row } = await supabase
      .from('tablet_push_subscriptions')
      .select('subscription')
      .eq('tablet_slot', target_slot)
      .single();

    if (!row?.subscription) {
      return new Response(
        JSON.stringify({ ok: false, message: 'No subscription registered for this slot', slot: target_slot }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pushPayload = JSON.stringify({ command, target_slot, target_name: payload?.target_name || target_slot, payload });
    const result = await sendWebPush(row.subscription, pushPayload, vapidPrivateKey);

    if (result.status === 410) {
      await supabase.from('tablet_push_subscriptions').delete().eq('tablet_slot', target_slot);
    }

    return new Response(JSON.stringify({ ok: result.ok, status: result.status, slot: target_slot }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
