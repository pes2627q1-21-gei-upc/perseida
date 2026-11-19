import { fireEvent, render, screen } from '@testing-library/react-native';

import { DateTimeField } from './DateTimeField.web';

// The browser gives the value as local time without a zone: `YYYY-MM-DDTHH:mm`.
const VALUE = new Date(2099, 7, 12, 20, 0);

describe('DateTimeField on the web', () => {
  it('is a datetime-local input named after the label, with the value in local time', async () => {
    await render(<DateTimeField label="Inici" value={VALUE} onChange={jest.fn()} />);

    const input = screen.getByLabelText('Inici');
    expect(input.props).toMatchObject({ type: 'datetime-local', value: '2099-08-12T20:00' });
  });

  it('reports the date the person types', async () => {
    const onChange = jest.fn();
    await render(<DateTimeField label="Inici" value={VALUE} onChange={onChange} />);

    fireEvent(screen.getByLabelText('Inici'), 'change', {
      target: { value: '2099-09-01T10:30' },
    });

    expect(onChange).toHaveBeenCalledWith(new Date(2099, 8, 1, 10, 30));
  });

  it('ignores an empty or incomplete value', async () => {
    const onChange = jest.fn();
    await render(<DateTimeField label="Inici" value={VALUE} onChange={onChange} />);

    fireEvent(screen.getByLabelText('Inici'), 'change', { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the input as invalid and shows the error as an alert', async () => {
    await render(
      <DateTimeField label="Fi" value={VALUE} onChange={jest.fn()} error="La fi és abans." />,
    );

    expect(screen.getByLabelText('Fi').props['aria-invalid']).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent('La fi és abans.');
  });

  it('is not invalid without an error', async () => {
    await render(<DateTimeField label="Fi" value={VALUE} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Fi').props['aria-invalid']).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
