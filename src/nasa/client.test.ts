import { describe, expect, it } from 'vitest'
import { pickFlare, pickPhoto } from './client'

describe('NASA feed parsing', () => {
  it('keeps a Perseverance frame and drops an empty feed', () => {
    const frame = pickPhoto({
      images: [
        {
          sol: 2031,
          date_taken_utc: '2026-11-06T12:16:25.848',
          title: 'Mars Perseverance Sol 2031: SuperCam Camera',
          camera: { instrument: 'SUPERCAM_RMI' },
          image_files: { small: 'https://mars.nasa.gov/frame.jpg' },
        },
      ],
    })
    expect(frame?.sol).toBe(2031)
    expect(frame?.camera).toBe('SUPERCAM_RMI')
    expect(frame?.earthDate).toBe('2026-11-06')
    expect(pickPhoto({ images: [] })).toBeNull()
    expect(pickPhoto({ error: 'down' })).toBeNull()
  })

  it('keeps the latest catalogued flare and ignores an empty catalog', () => {
    const note = pickFlare([
      { messageType: 'FLR', messageIssueTime: '2026-10-01T00:00Z', messageBody: 'threshold of C2.1' },
      { messageType: 'FLR', messageIssueTime: '2026-11-02T04:00Z', messageBody: 'threshold of M1.4' },
    ])
    expect(note).toEqual({ classType: 'M1.4', begin: '2026-11-02T04:00Z' })
    expect(pickFlare([])).toBeNull()
    expect(pickFlare({ message: 'no flares' })).toBeNull()
  })
})
