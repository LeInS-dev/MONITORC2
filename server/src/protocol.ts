/**
 * Protocolo WebSocket compartido entre el servidor relay (TS) y la app Android (Kotlin).
 *
 * Dos canales físicos:
 *  - Mensajes de control/metadatos → tramas de TEXTO (JSON de los tipos de abajo).
 *  - Media (vídeo, thumbnails, fotos, chunks de archivo) → tramas BINARIAS (ver framing).
 *
 * Framing binario
 * ---------------
 * Dispositivo → Servidor:   [type:u8][payload...]
 * Servidor  → Operador:     [type:u8][idLen:u8][deviceId:utf8][payload...]
 *   (el servidor solo antepone la identidad del dispositivo; el resto del payload
 *    se reenvía verbatim, así el operador sabe de qué equipo viene la trama).
 *
 * type:
 *   1  = frame de vídeo JPEG (Fase A)
 *   2  = config H.264 (SPS/PPS)            (Fase B)
 *   3  = frame H.264 keyframe              (Fase B)
 *   4  = frame H.264 delta                 (Fase B)
 *   10 = blob (thumbnail/foto/chunk de archivo), payload:
 *          [reqIdLen:u8][reqId:utf8][chunkIndex:u32 BE][last:u8][bytes...]
 */

export const BIN = {
  JPEG: 1,
  H264_CONFIG: 2,
  H264_KEY: 3,
  H264_DELTA: 4,
  BLOB: 10,
} as const;

export type KeyName =
  | 'back'
  | 'home'
  | 'recents'
  | 'power'
  | 'volup'
  | 'voldown'
  | 'enter'
  | 'delete';

/** Info pública de un dispositivo que ve el operador. */
export interface DevicePublic {
  deviceId: string;
  model: string;
  androidVersion: string;
  width: number;
  height: number;
  battery?: number;
  charging?: boolean;
  connectedAt: number;
}

export interface GalleryItem {
  id: string;
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
  dateTaken: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  modified: number;
}

/* ---------- Dispositivo → Servidor (JSON) ---------- */

export interface RegisterMsg {
  type: 'register';
  token: string;
  deviceId: string;
  model: string;
  androidVersion: string;
  width: number;
  height: number;
}
export interface StatusMsg {
  type: 'status';
  battery?: number;
  charging?: boolean;
}
export interface GalleryListMsg {
  type: 'gallery:list';
  requestId: string;
  total: number;
  items: GalleryItem[];
}
export interface FileListMsg {
  type: 'file:list';
  requestId: string;
  path: string;
  entries: FileEntry[];
}
export interface AckMsg {
  type: 'ack';
  requestId: string;
  ok: boolean;
  message?: string;
}

export type DeviceToServer =
  | RegisterMsg
  | StatusMsg
  | GalleryListMsg
  | FileListMsg
  | AckMsg;

/* ---------- Operador → Servidor → Dispositivo (JSON) ---------- */

export interface SubscribeMsg {
  type: 'subscribe';
  deviceId: string;
  mode: 'thumb' | 'full';
}
export interface UnsubscribeMsg {
  type: 'unsubscribe';
  deviceId: string;
}
/** Coordenadas en píxeles absolutos del dispositivo (0..width, 0..height). */
export interface TapMsg {
  type: 'tap';
  deviceId: string;
  x: number;
  y: number;
}
export interface SwipeMsg {
  type: 'swipe';
  deviceId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  durationMs: number;
}
export interface TextInputMsg {
  type: 'text';
  deviceId: string;
  text: string;
}
export interface KeyMsg {
  type: 'key';
  deviceId: string;
  key: KeyName;
}
export interface GalleryReqMsg {
  type: 'gallery:req';
  deviceId: string;
  requestId: string;
  offset: number;
  limit: number;
}
export interface PhotoReqMsg {
  type: 'photo:req';
  deviceId: string;
  requestId: string;
  id: string;
}
export interface FileListReqMsg {
  type: 'file:req';
  deviceId: string;
  requestId: string;
  path: string;
}
export interface FileDownloadReqMsg {
  type: 'file:download';
  deviceId: string;
  requestId: string;
  path: string;
}

export type OperatorToServer =
  | SubscribeMsg
  | UnsubscribeMsg
  | TapMsg
  | SwipeMsg
  | TextInputMsg
  | KeyMsg
  | GalleryReqMsg
  | PhotoReqMsg
  | FileListReqMsg
  | FileDownloadReqMsg;

/** Mensajes que el servidor reenvía tal cual al dispositivo (todos menos sub/unsub). */
export type ForwardedToDevice =
  | TapMsg
  | SwipeMsg
  | TextInputMsg
  | KeyMsg
  | GalleryReqMsg
  | PhotoReqMsg
  | FileListReqMsg
  | FileDownloadReqMsg;

/* ---------- Servidor → Operador (JSON) ---------- */

export interface DevicesMsg {
  type: 'devices';
  devices: DevicePublic[];
}
export interface DeviceAddedMsg {
  type: 'device:added';
  device: DevicePublic;
}
export interface DeviceRemovedMsg {
  type: 'device:removed';
  deviceId: string;
}
export interface ErrorMsg {
  type: 'error';
  message: string;
}

export type ServerToOperator =
  | DevicesMsg
  | DeviceAddedMsg
  | DeviceRemovedMsg
  | GalleryListMsg
  | FileListMsg
  | AckMsg
  | StatusRelayMsg
  | ErrorMsg;

/** status de un device reenviado al operador con su id. */
export interface StatusRelayMsg {
  type: 'device:status';
  deviceId: string;
  battery?: number;
  charging?: boolean;
}

/** Antepone [type][idLen][deviceId] a un payload de dispositivo para reenvío al operador. */
export function wrapForOperator(type: number, deviceId: string, payload: Buffer): Buffer {
  const id = Buffer.from(deviceId, 'utf8');
  const head = Buffer.from([type, id.length]);
  return Buffer.concat([head, id, payload]);
}
