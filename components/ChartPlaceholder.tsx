"use client"
import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const sampleData = [
  { time: '2026-01-01', value: 100 },
  { time: '2026-02-01', value: 120 },
  { time: '2026-03-01', value: 90 },
  { time: '2026-04-01', value: 140 },
  { time: '2026-05-01', value: 130 }
]

export default function ChartPlaceholder() {
  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={sampleData}>
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
