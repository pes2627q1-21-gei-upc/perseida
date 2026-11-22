import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { otherSpace, spotwiseLibrary, unvotedCafe } from '../../../../__mocks__/meetingPoints';
import { AppError, errorMessage } from '../../../shared/errors';
import i18n from '../../../shared/i18n';
import type { MeetingPoint } from '../api/meetingPoints';
import { MeetingPointList } from './MeetingPointList';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const points = [spotwiseLibrary, unvotedCafe, otherSpace] as unknown as MeetingPoint[];
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

const unavailable = new AppError({
  kind: 'http',
  code: 'MEETING_POINTS_UNAVAILABLE',
  status: 503,
  retryable: true,
});
const invalid = new AppError({
  kind: 'http',
  code: 'VALIDATION_ERROR',
  status: 422,
  retryable: false,
});

type Props = ComponentProps<typeof MeetingPointList>;

async function renderList(props: Partial<Props> & Pick<Props, 'status'>) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <MeetingPointList points={[]} error={null} onRetry={jest.fn()} {...props} />
    </SafeAreaProvider>,
  );
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('MeetingPointList (TG-352)', () => {
  it('says that the points are loading, for screen readers too', async () => {
    await renderList({ status: 'loading' });

    expect(screen.getByLabelText(t('meetingPoints.loading'))).toBeTruthy();
    expect(screen.queryByText(spotwiseLibrary.name)).toBeNull();
  });

  it('shows the approved message as an alert when Spotwise is unavailable (criterion 5)', async () => {
    await renderList({ status: 'error', error: unavailable });

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Ara no podem recomanar locals. Torna-ho a provar d'aquí a una estona.",
    );
  });

  it('offers to try again when the error is transient, and reports the retry', async () => {
    const onRetry = jest.fn();
    await renderList({ status: 'error', error: unavailable, onRetry });

    await fireEvent.press(screen.getByRole('button', { name: t('meetingPoints.retry') }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a final error without a retry button', async () => {
    await renderList({ status: 'error', error: invalid });

    expect(screen.getByRole('alert')).toHaveTextContent(
      errorMessage(i18n.t, 'VALIDATION_ERROR', false),
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says there are no places nearby when the list is empty', async () => {
    await renderList({ status: 'success', points: [] });

    expect(screen.getByText(t('meetingPoints.empty'))).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lists every point, in the order of the API, as a named list', async () => {
    await renderList({ status: 'success', points });

    // A list is a container, not an accessibility element, so it is found by its label.
    expect(screen.getByLabelText(t('meetingPoints.list.label')).props.accessibilityRole).toBe(
      'list',
    );
    const names = points.map((point) => point.name);
    const shown = screen
      .getAllByText(new RegExp(`^(${names.map(escape).join('|')})$`))
      .map((text) => text.props.children);
    expect(shown).toEqual(names);
    expect(screen.queryByText(t('meetingPoints.empty'))).toBeNull();
  });

  it('has no buttons when the points cannot be chosen', async () => {
    await renderList({ status: 'success', points });

    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('reports the point the person chooses', async () => {
    const onChoose = jest.fn();
    await renderList({ status: 'success', points, onChoose });

    await fireEvent.press(
      screen.getByRole('button', { name: new RegExp(escape(unvotedCafe.name)) }),
    );

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: unvotedCafe.id }));
  });
});
