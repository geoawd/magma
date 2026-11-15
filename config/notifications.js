window.CONFIG_NOTIFICATIONS = [
  {
    id: 'borehole',
    label: 'Report a borehole',
    title: 'Borehole notification',
    recipient: '',
    reminderText: 'Please attach borehole reports, logs, and photos to your email.',
    fields: [
      { name: 'name', label: 'Borehole name or ID', type: 'text' },
      { name: 'type', label: 'Type', type: 'select', options: ['Water supply', 'Monitoring', 'Ground investigation', 'Geothermal', 'Unknown'] },
      { name: 'depth', label: 'Depth (m)', type: 'number', min: 0, step: 0.1 },
      { name: 'date', label: 'Date drilled', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
      { name: 'contact', label: 'Your name and contact details', type: 'text' }
    ]
  },
  {
    id: 'landslide',
    label: 'Report a landslide',
    title: 'Landslide notification',
    recipient: '',
    reminderText: 'Please attach landslide reports and photos to your email.',
    fields: [
      { name: 'date', label: 'Date observed', type: 'date' },
      { name: 'extent', label: 'Approximate extent', type: 'text' },
      { name: 'notes', label: 'Description and notes', type: 'textarea', rows: 3 },
      { name: 'contact', label: 'Your name and contact details', type: 'text' }
    ]
  },
  {
    id: 'rockfall',
    label: 'Report a rockfall',
    title: 'Rockfall notification',
    recipient: '',
    reminderText: 'Please attach rockfall reports and photos to your email.',
    fields: [
      { name: 'date', label: 'Date observed', type: 'date' },
      { name: 'material', label: 'Location / material / approximate size', type: 'text' },
      { name: 'notes', label: 'Description and notes', type: 'textarea', rows: 3 },
      { name: 'contact', label: 'Your name and contact details', type: 'text' }
    ]
  }
];
