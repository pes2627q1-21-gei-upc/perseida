import { fireEvent, render, screen } from '@testing-library/react-native';

import { MapStatus } from './MapStatus';

describe('MapStatus', () => {
  it('shows that the events are loading, for screen readers too (criterion 5)', async () => {
    await render(<MapStatus state="loading" />);

    expect(screen.getByLabelText('Carregant esdeveniments')).toBeTruthy();
  });

  it('shows the empty message it is given (criterion 5)', async () => {
    await render(<MapStatus state="empty" message="Ara mateix no hi ha cap esdeveniment actiu." />);

    expect(screen.getByText('Ara mateix no hi ha cap esdeveniment actiu.')).toBeTruthy();
  });

  it('shows the error as an alert, with a retry button for transient errors (criterion 5)', async () => {
    const onRetry = jest.fn();
    await render(<MapStatus state="error" code="INTERNAL_ERROR" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Alguna cosa ha anat malament. Torna-ho a provar.',
    );
    const retry = screen.getByRole('button', { name: 'Torna-ho a provar' });
    expect(retry.props.accessibilityHint).toBe('Torna a carregar els esdeveniments');
    await fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no retry button for an error that will not go away', async () => {
    await render(<MapStatus state="error" code="VALIDATION_ERROR" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Alguna cosa ha anat malament.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('points to the list when none of the events has a place on the map', async () => {
    const onShowList = jest.fn();
    await render(<MapStatus state="noLocation" onShowList={onShowList} />);

    expect(screen.getByText("Cap d'aquests esdeveniments té una ubicació al mapa.")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Veure la llista' }));
    expect(onShowList).toHaveBeenCalledTimes(1);
  });
});
