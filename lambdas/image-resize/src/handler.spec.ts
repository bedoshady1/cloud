import { extractTaskIdFromKey } from './handler';

describe('extractTaskIdFromKey', () => {
  it('extracts taskId from S3 key', () => {
    const key = 'originals/task-abc-123/current/1234567890-photo.jpg';
    expect(extractTaskIdFromKey(key)).toBe('task-abc-123');
  });

  it('returns null for malformed key', () => {
    expect(extractTaskIdFromKey('bad-key')).toBeNull();
  });
});
