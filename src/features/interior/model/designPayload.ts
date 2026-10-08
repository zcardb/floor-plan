import type { Design } from './types';

/** Marker identifying design data this app embeds inside exported SVG / DXF files. */
export const PAYLOAD_MARKER = 'ZHUJIAN-STUDIO-DESIGN/1';
export interface DesignPayload { name: string; design: Design }

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** UTF-8 JSON encoded as base64, so it is safe in XML text and DXF comment lines. */
export function encodePayload(payload: DesignPayload): string {
  return toBase64(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodePayload(text: string): unknown {
  const binary = atob(text.replace(/\s+/g, ''));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
}
