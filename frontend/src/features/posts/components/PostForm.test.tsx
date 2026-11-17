import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AppError } from '../../../shared/errors';
import { POST_MAX_LENGTH, PostForm } from './PostForm';

const LABEL = 'La teva publicació';

function field() {
  return screen.getByLabelText(LABEL);
}

async function type(text: string) {
  await fireEvent.changeText(field(), text);
}

function serverError(code: string, status: number, retryable = false) {
  return new AppError({ kind: 'http', code, status, retryable });
}

describe('PostForm (create)', () => {
  it('has a labelled text field with a hint and a visible counter (WCAG 1.3.1, 3.3.2)', async () => {
    await render(<PostForm mode="create" onSubmit={jest.fn()} />);

    expect(screen.getByText(LABEL)).toBeOnTheScreen();
    expect(field().props.accessibilityHint).toBe(
      'Comparteix observacions i consells amb la comunitat.',
    );
    expect(field().props.multiline).toBe(true);
    expect(screen.getByLabelText('0 de 1000 caràcters')).toHaveTextContent('0/1000');
  });

  it('cannot publish an empty or blank text (TG-628 criterion 1)', async () => {
    const onSubmit = jest.fn();
    await render(<PostForm mode="create" onSubmit={onSubmit} />);
    await type('   ');

    const publish = screen.getByRole('button', { name: 'Publica' });
    expect(publish.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(publish);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('counts the trimmed text and says when it is too long, not only by colour (criterion 1)', async () => {
    const onSubmit = jest.fn();
    await render(<PostForm mode="create" onSubmit={onSubmit} />);

    await type(`  ${'a'.repeat(POST_MAX_LENGTH)}  `);
    expect(screen.getByLabelText('1000 de 1000 caràcters')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Publica' }).props.accessibilityState.disabled).toBe(
      false,
    );

    await type('a'.repeat(POST_MAX_LENGTH + 1));
    expect(screen.getByLabelText('1001 de 1000 caràcters')).toBeOnTheScreen();
    expect(screen.getByText('El text pot tenir com a màxim 1.000 caràcters.')).toBeOnTheScreen();
    const publish = screen.getByRole('button', { name: 'Publica' });
    expect(publish.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(publish);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the text, is busy meanwhile and empties the field after publishing', async () => {
    let finish!: () => void;
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((done) => {
          finish = done;
        }),
    );
    await render(<PostForm mode="create" onSubmit={onSubmit} />);
    await type('Es veu Júpiter');

    await fireEvent.press(screen.getByRole('button', { name: 'Publica' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Es veu Júpiter'));
    expect(screen.getByRole('button', { name: 'Publica', busy: true })).toBeOnTheScreen();
    finish();
    await waitFor(() => expect(field().props.value).toBe(''));
    expect(screen.queryByRole('button', { name: 'Cancel·la' })).toBeNull();
  });

  it('shows a text error from the server next to the field and keeps the text', async () => {
    const onSubmit = jest.fn().mockRejectedValue(serverError('POST_TEXT_EMPTY', 422));
    await render(<PostForm mode="create" onSubmit={onSubmit} />);
    await type('\u200b');

    await fireEvent.press(screen.getByRole('button', { name: 'Publica' }));

    expect(await screen.findByText('Escriu alguna cosa abans de publicar.')).toBeOnTheScreen();
    expect(field().props.value).toBe('\u200b');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('announces any other error as an alert with its translated code, never the server text', async () => {
    const onSubmit = jest.fn().mockRejectedValue(serverError('EVENT_NOT_FOUND', 404));
    await render(<PostForm mode="create" onSubmit={onSubmit} />);
    await type('Hola');

    await fireEvent.press(screen.getByRole('button', { name: 'Publica' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aquest esdeveniment ja no existeix.',
    );
    expect(field().props.value).toBe('Hola');
  });

  it('shows a generic message for an unexpected failure', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    await render(<PostForm mode="create" onSubmit={onSubmit} />);
    await type('Hola');

    await fireEvent.press(screen.getByRole('button', { name: 'Publica' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Alguna cosa ha anat malament.');
  });
});

describe('PostForm (edit)', () => {
  it('starts with the current text and saves the new one (TG-628 criterion 3)', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(
      <PostForm mode="edit" initialText="Abans" onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
    expect(field().props.value).toBe('Abans');

    await type('Després');
    await fireEvent.press(screen.getByRole('button', { name: 'Desa' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Després'));
    expect(field().props.value).toBe('Després');
  });

  it('can be cancelled without saving', async () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    await render(
      <PostForm mode="edit" initialText="Abans" onSubmit={onSubmit} onCancel={onCancel} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel·la' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains that only the author can edit the post (403)', async () => {
    const onSubmit = jest.fn().mockRejectedValue(serverError('POST_FORBIDDEN', 403));
    await render(
      <PostForm mode="edit" initialText="Abans" onSubmit={onSubmit} onCancel={jest.fn()} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Desa' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Només qui ha escrit aquesta publicació la pot editar o esborrar.',
    );
  });
});
