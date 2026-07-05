import type { ReactNode } from 'react'

const paths: Record<string, string> = {
  home: 'M3 9.5 12 3l9 6.5M5 9.5V21h14V9.5M9 21v-6h6v6',
  rocket: 'M5 13c-1.5 1.5-2 5-2 5s3.5-.5 5-2m4.5-8.5a8 8 0 0 1 4 4l-5 3-2-2zM15 9a2 2 0 1 0 0-.01M14 4l6 6c0 4-3 7-7 9l-3-3-3-3c2-4 5-7 9-7z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  braces: 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1',
  send: 'm22 2-7 20-4-9-9-4 20-7z',
  pointer: 'm9 9 5 12 1.8-5.2L21 14 9 9zM3 3l4 1M5 7 4 3M14 7l3-3M7 14l-3 3',
  database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  chart: 'M3 3v18h18M8 17V9M13 17V5M18 17v-7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3',
  wrench: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.7-.5-.5-2.7 2.7-2.6z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

function item(icon: string, label: string): { title: ReactNode } {
  return {
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
        <Icon d={paths[icon]} />
        {label}
      </span>
    ),
  }
}

export default {
  '-- getting-started': { type: 'separator', title: 'Getting Started' },
  index: item('home', 'Introduction'),
  'getting-started': item('rocket', 'Getting Started'),
  configuration: item('sliders', 'Configuration'),

  '-- core': { type: 'separator', title: 'Core Concepts' },
  events: item('zap', 'Events & Handlers'),
  payload: item('braces', 'Message Payload'),
  messages: item('send', 'Posting Messages'),

  '-- features': { type: 'separator', title: 'Features' },
  'cards-buttons': item('pointer', 'Cards & Buttons'),
  history: item('database', 'Message History'),
  polls: item('chart', 'Polls'),
  scheduling: item('clock', 'Scheduling'),

  '-- reference': { type: 'separator', title: 'Reference' },
  extensions: item('wrench', 'Extensions & native()'),
  troubleshooting: item('help', 'Troubleshooting & FAQ'),
}
