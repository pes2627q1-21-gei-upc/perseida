import { render, screen } from '@testing-library/react-native';

import { isOnGlass } from '../../../__mocks__/onGlass';
import { StatusPanel } from './StatusPanel';

const texts = { loadingLabel: 'Carregant', retry: 'Torna-ho a provar', retryHint: 'Recarrega' };

describe('StatusPanel', () => {
  // TG-658: on the sky of the posta theme the spinner was 2,33:1, under the 3:1 of WCAG 1.4.11.
  it('draws the loading spinner on glass, not straight on the sky', async () => {
    await render(<StatusPanel state="loading" texts={texts} />);

    expect(isOnGlass(screen.getByLabelText('Carregant'))).toBe(true);
  });
});
