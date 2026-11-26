import { initialOf, previewKind } from './conversationRow';

describe('initialOf (TG-65)', () => {
  it('is the first letter of the name, in capitals', () => {
    expect(initialOf('laia')).toBe('L');
    expect(initialOf('  àlex Soler ')).toBe('À');
  });

  it('keeps an emoji, made of several code units, whole', () => {
    expect(initialOf('🌙 Lluna')).toBe('🌙');
  });

  it('is «?» when the name is empty', () => {
    expect(initialOf('')).toBe('?');
    expect(initialOf('   ')).toBe('?');
  });
});

describe('previewKind (TG-65)', () => {
  it('is «none» without a last message', () => {
    expect(previewKind(undefined)).toBe('none');
  });

  it('is «mine» when the last message is mine, «theirs» otherwise', () => {
    const sentAt = '2026-11-19T12:00:00Z';
    expect(previewKind({ preview: 'Hola', sentAt, fromMe: true })).toBe('mine');
    expect(previewKind({ preview: 'Hola', sentAt, fromMe: false })).toBe('theirs');
  });
});
