const {CPCalendar, CPCalendarLane, CPCalendarEvent} = require('./continuousprint_calendar');

const mockQueue = {
  addr: '192.168.1.100:5000',
  name: 'test_lan_queue',
  peers: {
    '192.168.1.101:5000': {
      name: 'Printer1',
      status: 'idle',
      profile: {name: 'Prusa MK3S'},
      active_set: null
    },
    '192.168.1.102:5000': {
      name: 'Printer2', 
      status: 'printing',
      profile: {name: 'Prusa MK4'},
      active_set: 'set-123'
    }
  },
  jobs: jest.fn(() => [
    {
      _name: jest.fn(() => 'Test Job 1'),
      sets: jest.fn(() => [
        {
          id: 'set-123',
          shortName: jest.fn(() => 'test_part.gcode'),
          profiles: jest.fn(() => ['Prusa MK4']),
          remaining: jest.fn(() => 2),
          completed: jest.fn(() => 1),
          metadata: JSON.stringify({estimatedPrintTime: 3600})
        }
      ]),
      acquiredBy: jest.fn(() => 'Printer2')
    },
    {
      _name: jest.fn(() => 'Test Job 2'),
      sets: jest.fn(() => [
        {
          id: 'set-456',
          shortName: jest.fn(() => 'another_part.gcode'),
          profiles: jest.fn(() => ['Prusa MK3S']),
          remaining: jest.fn(() => 5),
          completed: jest.fn(() => 0),
          metadata: JSON.stringify({estimatedPrintTime: 7200})
        }
      ]),
      acquiredBy: jest.fn(() => undefined)
    }
  ]),
  active_sets: jest.fn(() => ['set-123'])
};

describe('CPCalendarEvent', () => {
  test('creates event with correct properties', () => {
    const job = {_name: jest.fn(() => 'Test Job')};
    const set = {
      shortName: jest.fn(() => 'test.gcode'),
      completed: jest.fn(() => 2),
      remaining: jest.fn(() => 3)
    };
    const startTime = new Date('2024-01-01T10:00:00');
    const endTime = new Date('2024-01-01T11:00:00');
    
    const event = new CPCalendarEvent(job, set, 'Printer1', startTime, endTime, false);
    
    expect(event.title()).toBe('Test Job');
    expect(event.setName()).toBe('test.gcode');
    expect(event.isActive()).toBe(false);
    expect(event.duration).toBe(3600000);
    expect(event.progress()).toBeCloseTo(40, 0);
  });
});

describe('CPCalendarLane', () => {
  test('creates lane with correct properties', () => {
    const lane = new CPCalendarLane('Printer1', '192.168.1.101:5000', 'Prusa MK3S', 'idle');
    
    expect(lane.printer).toBe('Printer1');
    expect(lane.displayName()).toBe('Printer1 (Prusa MK3S)');
    expect(lane.statusClass()).toBe('idle');
  });
  
  test('status class reflects printing state', () => {
    const lane = new CPCalendarLane('Printer2', '192.168.1.102:5000', 'Prusa MK4', 'printing');
    expect(lane.statusClass()).toBe('printing');
  });
});

describe('CPCalendar', () => {
  test('initializes with default values', () => {
    const calendar = new CPCalendar(mockQueue);
    
    expect(calendar.visible()).toBe(false);
    expect(calendar.timelineHours()).toBe(24);
    expect(calendar.pixelsPerHour()).toBe(60);
    expect(calendar.lanes().length).toBe(0);
  });
  
  test('toggle shows and hides calendar', () => {
    const calendar = new CPCalendar(mockQueue);
    
    expect(calendar.visible()).toBe(false);
    calendar.toggle();
    expect(calendar.visible()).toBe(true);
    calendar.toggle();
    expect(calendar.visible()).toBe(false);
  });
  
  test('refresh populates lanes from peers', () => {
    const calendar = new CPCalendar(mockQueue);
    calendar.refresh();
    
    expect(calendar.lanes().length).toBe(2);
  });
  
  test('zoom in increases pixels per hour', () => {
    const calendar = new CPCalendar(mockQueue);
    const initial = calendar.pixelsPerHour();
    
    calendar.zoomIn();
    expect(calendar.pixelsPerHour()).toBe(initial + 20);
  });
  
  test('zoom out decreases pixels per hour', () => {
    const calendar = new CPCalendar(mockQueue);
    const initial = calendar.pixelsPerHour();
    
    calendar.zoomOut();
    expect(calendar.pixelsPerHour()).toBe(initial - 20);
  });
  
  test('timeline width computed correctly', () => {
    const calendar = new CPCalendar(mockQueue);
    
    expect(calendar.timelineWidth()).toBe(24 * 60);
  });
  
  test('time markers generated for each hour', () => {
    const calendar = new CPCalendar(mockQueue);
    const markers = calendar.timeMarkers();
    
    expect(markers.length).toBe(25);
    expect(markers[0].position).toBe(0);
    expect(markers[1].position).toBe(60);
  });
  
  test('formatDuration handles hours and minutes', () => {
    const calendar = new CPCalendar(mockQueue);
    
    expect(calendar.formatDuration(3600000)).toBe('1h 0m');
    expect(calendar.formatDuration(5400000)).toBe('1h 30m');
    expect(calendar.formatDuration(1800000)).toBe('30m');
  });
  
  test('getEventStyle returns correct positioning', () => {
    const calendar = new CPCalendar(mockQueue);
    const startTime = new Date(calendar.timelineStart().getTime() + 3600000);
    const endTime = new Date(startTime.getTime() + 3600000);
    
    const event = {startTime, endTime};
    const style = calendar.getEventStyle(event);
    
    expect(style.left).toBe('60px');
    expect(style.width).toBe('60px');
  });
});
