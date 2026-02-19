import { describe, it, expect } from 'vitest';
import {
  normalizeFormatting,
  transformSubmittedData,
  isValidFileType,
  parseMediaFiles,
} from '../util';
import { CreateCardFormValues } from '../types';

describe('normalizeFormatting', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeFormatting('  hello  ')).toBe('hello');
  });

  it('collapses multiple spaces into one', () => {
    expect(normalizeFormatting('too   many    spaces')).toBe('too many spaces');
  });

  it('converts hyphen bullets to bullet points', () => {
    expect(normalizeFormatting('- item one\n- item two')).toBe('• item one\n• item two');
  });

  it('collapses 3+ consecutive blank lines to 2', () => {
    const input = 'line one\n\n\n\nline two';
    expect(normalizeFormatting(input)).toBe('line one\n\nline two');
  });

  it('converts indented hyphens to bullets (indent collapses to single space)', () => {
    const input = 'title\n  - nested item\n  - another';
    const result = normalizeFormatting(input);
    expect(result).toContain('• nested item');
    expect(result).toContain('• another');
  });

  it('handles empty string', () => {
    expect(normalizeFormatting('')).toBe('');
  });
});

describe('transformSubmittedData', () => {
  const baseValues: CreateCardFormValues = {
    deckName: 'TestDeck',
    modelName: 'Basic',
    tags: ['tag1'],
    field_Front: 'Question?',
    field_Back: 'Answer!',
  };

  it('maps field values to the fields object', () => {
    const result = transformSubmittedData(baseValues, ['Front', 'Back']);
    expect(result.fields.Front).toBe('Question?');
    expect(result.fields.Back).toBe('Answer!');
    expect(result.deckName).toBe('TestDeck');
    expect(result.modelName).toBe('Basic');
    expect(result.tags).toEqual(['tag1']);
  });

  it('defaults missing fields to empty string', () => {
    const result = transformSubmittedData(baseValues, ['Front', 'Back', 'Extra']);
    expect(result.fields.Extra).toBe('');
  });

  it('skips file processing when includeFiles is false', () => {
    const withFiles = {
      ...baseValues,
      file_Front: ['/path/to/image.jpg'],
    } as CreateCardFormValues;
    const result = transformSubmittedData(withFiles, ['Front', 'Back'], false);
    expect(result.picture).toHaveLength(0);
    expect(result.audio).toHaveLength(0);
    expect(result.video).toHaveLength(0);
  });

  it('processes image files when includeFiles is true', () => {
    const withFiles = {
      ...baseValues,
      file_Front: ['path/to/photo.png'],
    } as CreateCardFormValues;
    const result = transformSubmittedData(withFiles, ['Front', 'Back'], true);
    expect(result.picture).toHaveLength(1);
    expect(result.picture[0].filename).toBe('photo.png');
    expect(result.picture[0].fields).toEqual(['Front']);
  });

  it('processes audio files correctly', () => {
    const withAudio = {
      ...baseValues,
      file_Front: ['recordings/clip.mp3'],
    } as CreateCardFormValues;
    const result = transformSubmittedData(withAudio, ['Front', 'Back'], true);
    expect(result.audio).toHaveLength(1);
    expect(result.audio[0].filename).toBe('clip.mp3');
  });

  it('processes video files correctly', () => {
    const withVideo = {
      ...baseValues,
      file_Back: ['videos/demo.mp4'],
    } as CreateCardFormValues;
    const result = transformSubmittedData(withVideo, ['Front', 'Back'], true);
    expect(result.video).toHaveLength(1);
    expect(result.video[0].filename).toBe('demo.mp4');
  });
});

describe('isValidFileType', () => {
  it('accepts common image formats', () => {
    expect(isValidFileType('photo.jpg')).toBe(true);
    expect(isValidFileType('diagram.png')).toBe(true);
    expect(isValidFileType('anim.gif')).toBe(true);
    expect(isValidFileType('icon.svg')).toBe(true);
    expect(isValidFileType('pic.webp')).toBe(true);
  });

  it('accepts audio formats', () => {
    expect(isValidFileType('clip.mp3')).toBe(true);
    expect(isValidFileType('sound.wav')).toBe(true);
    expect(isValidFileType('voice.ogg')).toBe(true);
  });

  it('accepts video formats', () => {
    expect(isValidFileType('video.mp4')).toBe(true);
    expect(isValidFileType('clip.webm')).toBe(true);
  });

  it('rejects unsupported types', () => {
    expect(isValidFileType('doc.pdf')).toBe(false);
    expect(isValidFileType('data.csv')).toBe(false);
    expect(isValidFileType('script.js')).toBe(false);
    expect(isValidFileType('archive.zip')).toBe(false);
  });
});

describe('parseMediaFiles', () => {
  it('extracts images from img tags', () => {
    const html = '<img src="photo.jpg" alt="test"> some text <img src="diagram.png">';
    const files = parseMediaFiles(html);
    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({ type: 'image', filename: 'photo.jpg' });
    expect(files[1]).toEqual({ type: 'image', filename: 'diagram.png' });
  });

  it('extracts audio from sound tags', () => {
    const text = '[sound:recording.mp3]';
    const files = parseMediaFiles(text);
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({ type: 'audio', filename: 'recording.mp3' });
  });

  it('extracts video from sound tags', () => {
    const text = '[sound:clip.mp4]';
    const files = parseMediaFiles(text);
    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({ type: 'video', filename: 'clip.mp4' });
  });

  it('returns empty array for text without media', () => {
    expect(parseMediaFiles('just plain text')).toEqual([]);
  });

  it('handles mixed media in a single field', () => {
    const text = '<img src="pic.jpg"> some text [sound:audio.mp3] more [sound:video.webm]';
    const files = parseMediaFiles(text);
    expect(files).toHaveLength(3);
    expect(files.map(f => f.type)).toEqual(['image', 'audio', 'video']);
  });
});
