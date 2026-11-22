import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { otherSpace, spotwiseLibrary, unvotedCafe } from '../../../../__mocks__/meetingPoints';
import { AppError, errorMessage } from '../../../shared/errors';
import i18n from '../../../shared/i18n';
import { buildTheme } from '../../../shared/theme';
import type { MeetingPoint } from '../api/meetingPoints';
import { MeetingPointList } from './MeetingPointList';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const points: MeetingPoint[] = [spotwiseLibrary, unvotedCafe, otherSpace];
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

    const retry = screen.getByRole('button', { name: t('meetingPoints.retry') });
    // The hint says what the retry asks for again (TG-352).
    expect(retry.props.accessibilityHint).toBe(t('meetingPoints.retryHint'));
    await fireEvent.press(retry);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a final generic error, without a retry button, when the error is unknown', async () => {
    await renderList({ status: 'error', error: null });

    expect(screen.getByRole('alert')).toHaveTextContent(t('errors.GENERIC_FINAL'));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(t('meetingPoints.empty'))).toBeNull();
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

describe('MeetingPointList announcements (TG-352, WCAG 4.1.3)', () => {
  afterEach(() => jest.restoreAllMocks());

  /**
   * The announce of AccessibilityInfo is already a jest.fn() of the setup: spyOn gives back that
   * same mock and restoreAllMocks does not empty its calls. Only its calls are cleared, so the
   * other mocks of the file keep theirs.
   */
  function announceSpy() {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    return announce;
  }

  it('announces on iOS that there are no places nearby', async () => {
    // jest-expo runs as iOS, where a status is announced explicitly.
    const announce = announceSpy();

    await renderList({ status: 'success', points: [] });

    expect(announce).toHaveBeenCalledWith(t('meetingPoints.empty'));
  });

  it('does not announce the list of points', async () => {
    const announce = announceSpy();

    await renderList({ status: 'success', points });

    expect(announce).not.toHaveBeenCalledWith(t('meetingPoints.empty'));
  });

  it.each(['android', 'web'] as const)(
    'does not announce explicitly on %s: the polite live region reads it',
    async (os) => {
      jest.replaceProperty(Platform, 'OS', os);
      const announce = announceSpy();

      await renderList({ status: 'success', points: [] });

      expect(screen.getByText(t('meetingPoints.empty'))).toHaveProp(
        'accessibilityLiveRegion',
        'polite',
      );
      expect(announce).not.toHaveBeenCalledWith(t('meetingPoints.empty'));
    },
  );
});

describe('MeetingPointList safe areas (TG-352)', () => {
  const insets = { top: 47, left: 12, right: 8, bottom: 34 };
  const { spacing } = buildTheme('dia');

  it('keeps the points clear of the safe areas and of the bar at the top', async () => {
    await render(
      <SafeAreaProvider initialMetrics={{ frame: SAFE_AREA.frame, insets }}>
        <MeetingPointList
          status="success"
          points={points}
          error={null}
          onRetry={jest.fn()}
          topInset={60}
        />
      </SafeAreaProvider>,
    );

    const list = screen.getByLabelText(t('meetingPoints.list.label'));
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({
      paddingTop: 60 + spacing.md,
      paddingBottom: insets.bottom + spacing.md,
      paddingLeft: insets.left + spacing.md,
      paddingRight: insets.right + spacing.md,
    });
  });
});
