import { render, screen } from '@testing-library/react-native';

import { apodVideo } from '../../../../__mocks__/apod';
import { apodStrings } from '../strings';
import { ApodVideo } from './ApodVideo.web';

describe('ApodVideo (web)', () => {
  it('frames the video in a sandboxed iframe that is labelled for screen readers', async () => {
    const onError = jest.fn();
    await render(
      <ApodVideo url={apodVideo.url} label={apodStrings.videoLabel} onError={onError} />,
    );

    const frame = screen.root!;
    expect(frame.props.src).toBe(apodVideo.url);
    expect(frame.props.title).toBe(apodStrings.videoLabel);
    expect(frame.props.sandbox).toBe('allow-scripts allow-same-origin allow-presentation');
    expect(frame.props.sandbox).not.toContain('allow-top-navigation');
    expect(frame.props.referrerPolicy).toBe('strict-origin-when-cross-origin');
  });

  it('reports a failed load so the screen can show its error text', async () => {
    const onError = jest.fn();
    await render(
      <ApodVideo url={apodVideo.url} label={apodStrings.videoLabel} onError={onError} />,
    );

    screen.root!.props.onError();

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://evil.example/embed/abc',
    'https://www.youtube.com.evil.example/embed/abc',
    'https://www.youtube.com:8443/embed/abc',
    'https://localhost:8081/apod',
  ])('does not frame %s: it reports the error instead', async (url) => {
    const onError = jest.fn();
    await render(<ApodVideo url={url} label={apodStrings.videoLabel} onError={onError} />);

    expect(screen.root).toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });
});
