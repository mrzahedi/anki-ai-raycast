import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('../api/axios', () => {
  return {
    default: {
      post: vi.fn(),
    },
  };
});

vi.mock('../util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../util')>();
  return {
    ...actual,
    delay: vi.fn().mockResolvedValue(undefined),
  };
});

import apiClient from '../api/axios';
import { ankiReq } from '../api/ankiClient';
import { AnkiError } from '../error/AnkiError';

const mockPost = vi.mocked(apiClient.post);

beforeEach(() => {
  mockPost.mockReset();
});

describe('ankiReq', () => {
  it('returns result on successful request', async () => {
    mockPost.mockResolvedValueOnce({ data: { result: ['deck1', 'deck2'], error: null } });

    const result = await ankiReq<string[]>('deckNames');
    expect(result).toEqual(['deck1', 'deck2']);
    expect(mockPost).toHaveBeenCalledWith('', {
      action: 'deckNames',
      version: 6,
      params: {},
    });
  });

  it('passes params correctly', async () => {
    mockPost.mockResolvedValueOnce({ data: { result: 12345, error: null } });

    await ankiReq('addNote', { note: { deckName: 'Test' } });
    expect(mockPost).toHaveBeenCalledWith('', {
      action: 'addNote',
      version: 6,
      params: { note: { deckName: 'Test' } },
    });
  });

  it('throws AnkiError when Anki returns an error string', async () => {
    mockPost.mockResolvedValueOnce({
      data: { result: null, error: 'duplicate note' },
    });

    await expect(ankiReq('addNote', { note: {} })).rejects.toThrow(AnkiError);
    await expect(ankiReq('addNote', { note: {} })).rejects.toThrow();
  });

  it('retries on ECONNRESET and eventually succeeds', async () => {
    const econnError = new AxiosError(
      'socket hang up',
      'ECONNRESET',
      undefined,
      undefined,
      undefined
    );

    mockPost
      .mockRejectedValueOnce(econnError)
      .mockRejectedValueOnce(econnError)
      .mockResolvedValueOnce({ data: { result: 'ok', error: null } });

    const result = await ankiReq<string>('sync');
    expect(result).toBe('ok');
    expect(mockPost).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries on ECONNRESET', async () => {
    const econnError = new AxiosError(
      'socket hang up',
      'ECONNRESET',
      undefined,
      undefined,
      undefined
    );

    mockPost.mockRejectedValue(econnError);

    await expect(ankiReq('sync')).rejects.toThrow('socket hang up');
    expect(mockPost).toHaveBeenCalledTimes(5);
  });

  it('throws immediately on non-ECONNRESET errors', async () => {
    const networkError = new AxiosError(
      'Network Error',
      'ERR_NETWORK',
      undefined,
      undefined,
      undefined
    );

    mockPost.mockRejectedValueOnce(networkError);

    await expect(ankiReq('deckNames')).rejects.toThrow('Network Error');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('throws on generic non-Axios errors', async () => {
    mockPost.mockRejectedValueOnce(new Error('Something unexpected'));

    await expect(ankiReq('deckNames')).rejects.toThrow('Something unexpected');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
