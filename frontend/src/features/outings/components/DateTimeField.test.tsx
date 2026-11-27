import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { formatDateTime } from '../formatOuting';
import { DateTimeField } from './DateTimeField';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const Picker = (props: object) => <MockView testID="ios-picker" {...props} />;
  return {
    __esModule: true,
    default: Picker,
    DateTimePickerAndroid: { open: jest.fn() },
  };
});

const VALUE = new Date('2099-08-12T20:00:00Z');
const open = jest.mocked(DateTimePickerAndroid.open);

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

afterEach(() => {
  jest.clearAllMocks();
  setPlatform('ios');
});

describe('DateTimeField on iOS', () => {
  it('shows the label and a date and time picker with the value', async () => {
    await render(<DateTimeField label="Inici" value={VALUE} onChange={jest.fn()} />);

    expect(screen.getByText('Inici')).toBeTruthy();
    expect(screen.getByTestId('ios-picker').props).toMatchObject({
      value: VALUE,
      mode: 'datetime',
      accessibilityLabel: 'Inici',
    });
  });

  it('reports the date the person picks', async () => {
    const onChange = jest.fn();
    await render(<DateTimeField label="Inici" value={VALUE} onChange={onChange} />);
    const picked = new Date('2099-09-01T10:30:00Z');

    fireEvent(screen.getByTestId('ios-picker'), 'valueChange', { nativeEvent: {} }, picked);

    expect(onChange).toHaveBeenCalledWith(picked);
  });
});

describe('DateTimeField on Android', () => {
  beforeEach(() => setPlatform('android'));

  it('is a button that says the label and the current value', async () => {
    await render(<DateTimeField label="Inici" value={VALUE} onChange={jest.fn()} />);

    const value = formatDateTime(VALUE, 'ca');
    expect(screen.getByRole('button', { name: `Inici: ${value}` })).toBeTruthy();
  });

  it('asks for the date and then the time, and reports the result', async () => {
    const onChange = jest.fn();
    await render(<DateTimeField label="Inici" value={VALUE} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toMatchObject({ mode: 'date', value: VALUE });

    const pickedDay = new Date(2099, 8, 1, 0, 0);
    await act(async () => open.mock.calls[0][0].onValueChange?.({} as never, pickedDay));
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1][0]).toMatchObject({ mode: 'time' });

    const pickedTime = new Date(2099, 0, 1, 10, 30);
    await act(async () => open.mock.calls[1][0].onValueChange?.({} as never, pickedTime));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(new Date(2099, 8, 1, 10, 30));
  });

  it('changes nothing when the person closes the date picker', async () => {
    const onChange = jest.fn();
    await render(<DateTimeField label="Inici" value={VALUE} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button'));
    await act(async () => open.mock.calls[0][0].onDismiss?.());

    expect(open).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('changes nothing when the person closes the time picker', async () => {
    const onChange = jest.fn();
    await render(<DateTimeField label="Inici" value={VALUE} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button'));
    await act(async () => open.mock.calls[0][0].onValueChange?.({} as never, new Date()));
    await act(async () => open.mock.calls[1][0].onDismiss?.());

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DateTimeField error', () => {
  it('shows the error of the field as an alert', async () => {
    await render(
      <DateTimeField label="Fi" value={VALUE} onChange={jest.fn()} error="La fi és abans." />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('La fi és abans.');
  });

  it('shows no alert without an error', async () => {
    await render(<DateTimeField label="Fi" value={VALUE} onChange={jest.fn()} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
