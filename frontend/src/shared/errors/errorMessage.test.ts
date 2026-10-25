import i18n from '../i18n';
import { errorMessage } from './errorMessage';

const t = i18n.t.bind(i18n);

describe('errorMessage', () => {
  it('translates a known code with errors.<CODE>', () => {
    expect(errorMessage(t, 'NETWORK_ERROR', true)).toBe(
      'No hi ha connexió. Comprova la xarxa i torna-ho a provar.',
    );
  });

  it('uses the generic message for an unknown retryable code', () => {
    expect(errorMessage(t, 'SOMETHING_NEW', true)).toBe(
      'Alguna cosa ha anat malament. Torna-ho a provar.',
    );
  });

  it('uses the generic message without a retry for an unknown non-retryable code', () => {
    expect(errorMessage(t, 'SOMETHING_NEW', false)).toBe('Alguna cosa ha anat malament.');
  });

  it.each(['a.b', 'x:y', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'never shows the key for the odd code "%s"',
    (code) => {
      expect(errorMessage(t, code, true)).toBe('Alguna cosa ha anat malament. Torna-ho a provar.');
      expect(errorMessage(t, code, false)).toBe('Alguna cosa ha anat malament.');
    },
  );

  it('translates in the active language', async () => {
    await i18n.changeLanguage('en');
    try {
      expect(errorMessage(t, 'SOMETHING_NEW', true)).toBe(
        'Something went wrong. Please try again.',
      );
    } finally {
      await i18n.changeLanguage('ca');
    }
  });
});
