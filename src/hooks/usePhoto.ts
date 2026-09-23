/**
 * Capturing and preparing the result-form photo.
 *
 * Compression is the single most consequential detail in this app. A modern
 * phone camera produces a 4-6MB JPEG. On the 2G/3G an agent may have at a
 * rural polling station at 22:00, that either fails or takes minutes, and an
 * agent whose upload fails twice stops trying.
 *
 * A declaration form is black text on white paper, so it survives aggressive
 * compression far better than a photograph of a scene. Resizing the long edge
 * to 1600px at JPEG quality 0.7 keeps the handwriting legible while bringing a
 * typical form to roughly 250-500KB -- about a tenth of the original.
 *
 * 1600px is not arbitrary: below about 1200px the pencil figures on a
 * carbon-copy form start to break up when a verifier zooms in, and the photo
 * stops being usable as evidence. Legibility sets the floor, bandwidth sets
 * the ceiling.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

import { withRelockSuppressed } from '../services/appStateGuard';

/** Long-edge target. See module note on why this value. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
  /** Bytes after compression, so the UI can show what will be sent. */
  sizeBytes: number | null;
}

/**
 * Compress, falling back to the original photo if manipulation fails.
 *
 * Resizing decodes the full-resolution bitmap into memory, which is the most
 * memory-hungry thing this app does and the most likely to fail on a cheap
 * handset that is already low on RAM. If it does fail, the right outcome is an
 * uncompressed upload -- slow, but the evidence still gets there -- not a dead
 * end for an agent who cannot re-photograph a form that has already been taken
 * down.
 */
async function prepare(uri: string, width: number, height: number): Promise<PreparedPhoto> {
  try {
    return await compress(uri, width, height);
  } catch (error) {
    console.warn('[sentinel] photo compression failed, sending original', error);
    return { uri, width, height, sizeBytes: null };
  }
}

async function compress(uri: string, width: number, height: number): Promise<PreparedPhoto> {
  const longEdge = Math.max(width, height);

  // Only downscale. Upscaling a small photo adds bytes without adding detail.
  const resize =
    longEdge > MAX_EDGE
      ? width >= height
        ? { width: MAX_EDGE }
        : { height: MAX_EDGE }
      : undefined;

  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  if (resize) context.resize(resize);

  const image = await context.renderAsync();
  const result = await image.saveAsync({
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  let sizeBytes: number | null = null;
  try {
    // Best effort. A missing size is cosmetic -- it only affects the hint
    // shown under the thumbnail, so never let it break the capture flow.
    const { File } = await import('expo-file-system');
    sizeBytes = new File(result.uri).size ?? null;
  } catch {
    sizeBytes = null;
  }

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    sizeBytes,
  };
}

function explainPermission(kind: 'camera' | 'library'): void {
  Alert.alert(
    kind === 'camera' ? 'Camera access needed' : 'Photo access needed',
    kind === 'camera'
      ? 'Sentinel needs the camera to photograph the declaration form. Enable it in Settings.'
      : 'Sentinel needs photo access to attach an existing picture. Enable it in Settings.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ],
  );
}

/**
 * Photograph the form.
 *
 * Returns null if the agent cancels or declines permission -- cancelling is a
 * normal action, not an error, and must not produce a scary dialog.
 */
export async function captureFormPhoto(): Promise<PreparedPhoto | null> {
  return withRelockSuppressed(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      explainPermission('camera');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      // No cropping step. The whole form matters, including the header and the
      // presiding officer's signature, and an agent under time pressure should
      // not be deciding what to crop out of evidence.
      allowsEditing: false,
      // Not 1. The captured file is re-encoded at JPEG_QUALITY moments later
      // anyway, so a maximum-quality intermediate buys nothing and costs a
      // multi-megabyte write and read back on the slowest storage in the
      // phone. Visually lossless at the scale a form is read at.
      quality: 0.8,
      exif: false,
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    return prepare(asset.uri, asset.width, asset.height);
  });
}

/** Attach a photo already taken, e.g. when the form was shot before opening the app. */
export async function pickFormPhoto(): Promise<PreparedPhoto | null> {
  return withRelockSuppressed(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      explainPermission('library');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      exif: false,
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    return prepare(asset.uri, asset.width, asset.height);
  });
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
