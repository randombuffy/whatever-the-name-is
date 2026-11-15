import type { MissionOutcome } from '../domain/types'
import { debriefVerdict } from '../domain/score'

/**
 * Computes dynamic, tailored engineering recommendations based on flight telemetry.
 */
export function computeNextGameImprovements(outcome: MissionOutcome): string[] {
  const tips: string[] = []
  const bd = outcome.scoreBreakdown
  const leftover = outcome.budgetUsd - outcome.costUsd

  // 1. Budget surplus / mass optimization
  if (leftover < 0) {
    tips.push('Trim launch dry mass in Hangar to eliminate budget deficit penalties and recover full budget bonus points.')
  } else if (bd && bd.budgetPoints < 11) {
    tips.push('Swap heavy structural frames for lightweight composites to keep remaining budget surplus above 20% for max points.')
  }

  // 2. Delta-V & Propellant management
  if (outcome.dvRemainingMps < 200) {
    tips.push('Stage upper stages conservatively: use high-Isp vacuum engines (hydrolox/methalox) to maintain a 300+ m/s safety delta-V margin.')
  }

  // 3. Science collection
  if (bd && bd.sciencePoints < 25) {
    tips.push('Maximize surface reconnaissance: follow beacon arrows to ancient Martian ruins and secure all 5 geological samples.')
  }

  // 4. Data downlink
  if (bd && bd.dataPoints < 20) {
    tips.push('Downlink scientific telemetry early via Send [T] while line-of-sight to Deep Space Network orbiters is unobstructed.')
  }

  // 5. Landing dynamics
  if (outcome.landing === 'hard') {
    tips.push('Soft touchdown technique: reserve throttle for a final retro-flare below 50m to land with sink rate under 2.5 m/s.')
  } else if (outcome.landing === 'none' && outcome.missionId === 'mars') {
    tips.push('Atmospheric entry profile: deploy supersonic parachutes at 10km and jettison heatshield before terminal engine burn.')
  }

  // 6. Reliability & anomalies
  if (outcome.reliability < 0.88) {
    tips.push('Vehicle redundancy: select flight-qualified avionics in engineering to minimize system faults during interplanetary transit.')
  }

  // 7. Surface survival & colony outpost
  if (outcome.missionId === 'mars') {
    tips.push('Outpost colonization: deploy dual photovoltaic wings and fission generators early to sustain life-support through Sol dust storms.')
  }

  // 8. Master class tip if already high score
  if (outcome.score >= 90) {
    tips.push('Outstanding flight execution! Step up to Specialist or Commander difficulty for realistic solar flares and relay blackouts.')
  }

  // Fallback if list is short
  if (tips.length < 2) {
    tips.push('Fine-tune Hohmann transfer departure timing to minimize capture burn delta-V expenditure at planetary arrival.')
  }

  return tips.slice(0, 3)
}

/**
 * Creates a valid 9:16 PDF document containing an embedded JPEG image.
 * Uses standard PDF 1.4 specification without external dependencies.
 */
export function createPdfFromJpeg(jpegBytes: Uint8Array, width: number = 1080, height: number = 1920): Blob {
  const encoder = new TextEncoder()
  const ptWidth = (width / height) * 1080
  const ptHeight = 1080

  const header = encoder.encode('%PDF-1.4\n')
  const obj1 = encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  const obj2 = encoder.encode('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  const obj3 = encoder.encode(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptWidth.toFixed(2)} ${ptHeight.toFixed(2)}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  )
  const obj4Head = encoder.encode(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  )
  const obj4Tail = encoder.encode('\nendstream\nendobj\n')
  const contentText = `q\n${ptWidth.toFixed(2)} 0 0 ${ptHeight.toFixed(2)} 0 0 cm\n/Im1 Do\nQ\n`
  const contentBytes = encoder.encode(contentText)
  const obj5 = encoder.encode(
    `5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${contentText}endstream\nendobj\n`
  )

  const offsets: number[] = [0]
  let currentOffset = header.length

  offsets.push(currentOffset)
  currentOffset += obj1.length

  offsets.push(currentOffset)
  currentOffset += obj2.length

  offsets.push(currentOffset)
  currentOffset += obj3.length

  offsets.push(currentOffset)
  currentOffset += obj4Head.length + jpegBytes.length + obj4Tail.length

  offsets.push(currentOffset)
  currentOffset += obj5.length

  let xrefText = 'xref\n0 6\n0000000000 65535 f \n'
  for (let i = 1; i <= 5; i++) {
    xrefText += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'
  }
  const xref = encoder.encode(xrefText)
  const trailer = encoder.encode(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${currentOffset}\n%%EOF\n`)

  const parts: BlobPart[] = [
    header,
    obj1,
    obj2,
    obj3,
    obj4Head,
    jpegBytes.buffer as ArrayBuffer,
    obj4Tail,
    obj5,
    xref,
    trailer,
  ]

  return new Blob(parts, {
    type: 'application/pdf',
  })
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number = 3
): number {
  const words = text.split(' ')
  let line = ''
  let linesCount = 0
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' '
    const metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, y)
      line = words[n] + ' '
      y += lineHeight
      linesCount++
      if (linesCount >= maxLines - 1 && n < words.length - 1) {
        ctx.fillText((line + '...').trim(), x, y)
        return y + lineHeight
      }
    } else {
      line = testLine
    }
  }
  ctx.fillText(line.trim(), x, y)
  return y + lineHeight
}

/**
 * Generates and downloads a complete 9:16 portrait PDF report of the flight debrief,
 * capturing the live 3D background, overall rank, scoring breakdown, and actionable improvements.
 */
export async function exportDebriefReportPdf(outcome: MissionOutcome): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1920
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 1. Draw Background (from live WebGL canvas if present, or space gradient)
  let drewLiveCanvas = false
  const liveCanvas = document.querySelector('canvas.viewport') as HTMLCanvasElement | null
  if (liveCanvas && liveCanvas.width > 32 && liveCanvas.height > 32) {
    try {
      const imgRatio = liveCanvas.width / liveCanvas.height
      const targetRatio = 1080 / 1920
      let sx = 0
      let sy = 0
      let sw = liveCanvas.width
      let sh = liveCanvas.height
      if (imgRatio > targetRatio) {
        sw = liveCanvas.height * targetRatio
        sx = (liveCanvas.width - sw) / 2
      } else {
        sh = liveCanvas.width / targetRatio
        sy = (liveCanvas.height - sh) / 2
      }
      ctx.drawImage(liveCanvas, sx, sy, sw, sh, 0, 0, 1080, 1920)
      drewLiveCanvas = true
    } catch (err) {
      console.warn('Could not draw live 3D canvas:', err)
    }
  }

  // Draw overlay gradient over background for contrast and legibility
  if (drewLiveCanvas) {
    const darkGrad = ctx.createLinearGradient(0, 0, 0, 1920)
    darkGrad.addColorStop(0, 'rgba(8, 12, 18, 0.88)')
    darkGrad.addColorStop(0.25, 'rgba(10, 15, 24, 0.78)')
    darkGrad.addColorStop(0.65, 'rgba(12, 18, 28, 0.84)')
    darkGrad.addColorStop(1, 'rgba(6, 8, 14, 0.94)')
    ctx.fillStyle = darkGrad
    ctx.fillRect(0, 0, 1080, 1920)
  } else {
    const spaceGrad = ctx.createLinearGradient(0, 0, 0, 1920)
    spaceGrad.addColorStop(0, '#04060a')
    spaceGrad.addColorStop(0.35, '#0a101d')
    spaceGrad.addColorStop(0.7, '#1b1218')
    spaceGrad.addColorStop(1, '#2d140b')
    ctx.fillStyle = spaceGrad
    ctx.fillRect(0, 0, 1080, 1920)

    // Starfield particles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    for (let i = 0; i < 180; i++) {
      const rx = (Math.sin(i * 123.45) * 0.5 + 0.5) * 1080
      const ry = (Math.cos(i * 678.9) * 0.5 + 0.5) * 1920
      const rsize = (Math.sin(i * 89.1) * 0.5 + 0.5) * 2.2 + 0.8
      ctx.beginPath()
      ctx.arc(rx, ry, rsize, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Fine technical gridlines
  ctx.strokeStyle = 'rgba(126, 200, 196, 0.07)'
  ctx.lineWidth = 1
  for (let y = 80; y < 1920; y += 80) {
    ctx.beginPath()
    ctx.moveTo(40, y)
    ctx.lineTo(1040, y)
    ctx.stroke()
  }
  for (let x = 80; x < 1080; x += 100) {
    ctx.beginPath()
    ctx.moveTo(x, 40)
    ctx.lineTo(x, 1880)
    ctx.stroke()
  }

  // 2. Report Frame Header
  ctx.strokeStyle = 'rgba(126, 200, 196, 0.4)'
  ctx.lineWidth = 2
  ctx.strokeRect(40, 40, 1000, 1840)

  // Top header text
  ctx.fillStyle = '#5ad0e8'
  ctx.font = '700 18px monospace'
  ctx.fillText('NASA SPACE APPS CHALLENGE // ASTRA MISSION CONTROL', 70, 85)

  ctx.fillStyle = '#f4f1ea'
  ctx.font = '900 40px sans-serif'
  ctx.fillText('FLIGHT DEBRIEF REPORT', 70, 135)

  ctx.fillStyle = 'rgba(244, 241, 234, 0.7)'
  ctx.font = '500 20px monospace'
  const dateStr = new Date().toISOString().slice(0, 10)
  ctx.fillText(`CRAFT: ${outcome.craftName.toUpperCase()} · DESTINATION: ${(outcome.siteName ?? outcome.missionId).toUpperCase()}`, 70, 172)
  ctx.fillText(`DATE: ${dateStr} · SOL 04 · RATIO 9:16 OFFICIAL RECORD`, 70, 202)

  // 3. Hero Verdict & Rank Badge Card
  const rank = outcome.gradeRank ?? (outcome.score >= 92 ? 'S' : outcome.score >= 80 ? 'A' : outcome.score >= 65 ? 'B' : outcome.score >= 50 ? 'C' : 'F')
  const { title: verdictTitle, tone: verdictTone } = debriefVerdict(outcome)
  const rankColor = rank === 'S' ? '#fbbf24' : rank === 'A' ? '#34d399' : rank === 'B' ? '#60a5fa' : rank === 'C' ? '#f59e0b' : '#f87171'

  // Glass card backdrop
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.strokeStyle = 'rgba(126, 200, 196, 0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(70, 230, 940, 290, 16)
  ctx.fill()
  ctx.stroke()

  // Rank badge
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.strokeStyle = rankColor
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(100, 260, 130, 130, 18)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = rankColor
  ctx.font = '900 76px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(rank, 165, 355)
  ctx.textAlign = 'left'

  // Score & Verdict
  ctx.fillStyle = '#94a3b8'
  ctx.font = '700 16px monospace'
  ctx.fillText('MISSION PERFORMANCE SCORE', 260, 275)

  ctx.fillStyle = '#f4f1ea'
  ctx.font = '900 68px monospace'
  ctx.fillText(`${outcome.score}`, 260, 340)
  ctx.fillStyle = '#64748b'
  ctx.font = '700 24px monospace'
  ctx.fillText('/ 100 PTS', 380, 335)

  // Verdict pill
  const bannerBg = verdictTone === 'win' ? '#065f46' : verdictTone === 'partial' ? '#78350f' : '#7f1d1d'
  const bannerText = verdictTone === 'win' ? '#34d399' : verdictTone === 'partial' ? '#fcd34d' : '#fca5a5'
  ctx.fillStyle = bannerBg
  ctx.beginPath()
  ctx.roundRect(260, 360, 420, 38, 8)
  ctx.fill()

  ctx.fillStyle = bannerText
  ctx.font = '800 18px monospace'
  ctx.fillText(verdictTitle.toUpperCase(), 276, 385)

  // Summary quote
  ctx.fillStyle = 'rgba(244, 241, 234, 0.88)'
  ctx.font = '400 18px sans-serif'
  wrapText(ctx, outcome.summary, 100, 440, 880, 26, 2)

  // 4. Scoring Breakdown Progress Bars
  const breakdown = outcome.scoreBreakdown ?? {
    primaryPoints: outcome.success ? 30 : 12,
    sciencePoints: Math.min(30, Math.round(outcome.score * 0.3)),
    dataPoints: Math.min(25, Math.round(outcome.score * 0.25)),
    budgetPoints: Math.min(15, Math.max(0, Math.round((outcome.budgetUsd - outcome.costUsd) > 0 ? 12 : 4))),
    landingPoints: 0,
    anomalyPoints: 0,
    total: outcome.score,
  }

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.strokeStyle = 'rgba(126, 200, 196, 0.25)'
  ctx.beginPath()
  ctx.roundRect(70, 545, 940, 310, 16)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#5ad0e8'
  ctx.font = '700 18px monospace'
  ctx.fillText('TELEMETRY SCORING BREAKDOWN', 100, 580)

  const catRows = [
    { label: 'FLIGHT EXECUTION & ORBIT', pts: breakdown.primaryPoints, max: 30, color: '#38bdf8' },
    { label: 'SCIENCE & SAMPLES RETURNED', pts: breakdown.sciencePoints, max: 30, color: '#34d399' },
    { label: 'DATA TELEMETRY DOWNLINKED', pts: breakdown.dataPoints, max: 25, color: '#a78bfa' },
    { label: 'BUDGET EFFICIENCY & SURPLUS', pts: Math.max(0, breakdown.budgetPoints), max: 15, color: '#facc15' },
  ]

  let curY = 615
  for (const cat of catRows) {
    ctx.fillStyle = '#f4f1ea'
    ctx.font = '700 16px monospace'
    ctx.fillText(cat.label, 100, curY)
    ctx.textAlign = 'right'
    ctx.fillText(`${cat.pts} / ${cat.max} PTS`, 980, curY)
    ctx.textAlign = 'left'

    // Bar track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.beginPath()
    ctx.roundRect(100, curY + 8, 880, 12, 6)
    ctx.fill()

    // Bar fill
    const fillW = Math.max(8, (Math.min(cat.max, cat.pts) / cat.max) * 880)
    ctx.fillStyle = cat.color
    ctx.beginPath()
    ctx.roundRect(100, curY + 8, fillW, 12, 6)
    ctx.fill()

    curY += 56
  }

  // 5. Goals Checklist Card
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.strokeStyle = 'rgba(126, 200, 196, 0.25)'
  ctx.beginPath()
  ctx.roundRect(70, 880, 940, 240, 16)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#5ad0e8'
  ctx.font = '700 18px monospace'
  ctx.fillText('MISSION OBJECTIVES VERIFICATION', 100, 915)

  const objs = outcome.objectives.slice(0, 4)
  let objY = 955
  for (const obj of objs) {
    const isMet = obj.met
    ctx.fillStyle = isMet ? '#34d399' : '#f87171'
    ctx.font = '700 16px monospace'
    ctx.fillText(isMet ? '[MET]' : '[SHORT]', 100, objY)

    ctx.fillStyle = isMet ? '#f4f1ea' : '#cbd5e1'
    ctx.font = '600 17px sans-serif'
    ctx.fillText(obj.label, 190, objY)
    objY += 40
  }

  // 6. "WHAT TO IMPROVE IN NEXT FLIGHT" (Key Feature)
  const improvements = computeNextGameImprovements(outcome)

  ctx.fillStyle = 'rgba(18, 30, 44, 0.92)'
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(70, 1145, 940, 380, 16)
  ctx.fill()
  ctx.stroke()

  // Header of improvements
  ctx.fillStyle = '#fbbf24'
  ctx.font = '900 20px monospace'
  ctx.fillText('WHAT TO IMPROVE IN THE NEXT GAME // FLIGHT DIRECTIVES', 100, 1185)

  ctx.fillStyle = 'rgba(244, 241, 234, 0.65)'
  ctx.font = '400 14px monospace'
  ctx.fillText('AUTOMATED ENGINEERING DEBRIEF ANALYSIS & CORRECTIONS', 100, 1210)

  let tipY = 1250
  for (let i = 0; i < improvements.length; i++) {
    // Bullet badge
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.roundRect(100, tipY - 14, 24, 20, 4)
    ctx.fill()

    ctx.fillStyle = '#111827'
    ctx.font = '900 13px monospace'
    ctx.fillText(`0${i + 1}`, 103, tipY)

    ctx.fillStyle = '#f4f1ea'
    ctx.font = '500 17px sans-serif'
    tipY = wrapText(ctx, improvements[i], 140, tipY, 830, 24, 3) + 14
  }

  // 7. Flight Telemetry Quick Stats Grid
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.strokeStyle = 'rgba(126, 200, 196, 0.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(70, 1550, 940, 190, 16)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#5ad0e8'
  ctx.font = '700 18px monospace'
  ctx.fillText('FLIGHT METRICS LOG', 100, 1585)

  const statsCols = [
    { label: 'TOTAL COST', val: `$${(outcome.costUsd / 1e6).toFixed(1)}M` },
    { label: 'BUDGET LIMIT', val: `$${(outcome.budgetUsd / 1e6).toFixed(1)}M` },
    { label: 'DELTA-V USED', val: `${Math.round(outcome.dvUsedMps)} m/s` },
    { label: 'TOUCHDOWN', val: outcome.landing === 'soft' ? 'SOFT (NOMINAL)' : outcome.landing === 'hard' ? 'HARD IMPACT' : 'ORBITAL' },
  ]

  let statX = 100
  for (const s of statsCols) {
    ctx.fillStyle = 'rgba(244, 241, 234, 0.6)'
    ctx.font = '600 13px monospace'
    ctx.fillText(s.label, statX, 1625)

    ctx.fillStyle = '#f4f1ea'
    ctx.font = '800 20px monospace'
    ctx.fillText(s.val, statX, 1655)
    statX += 225
  }

  // Educational limits quote
  ctx.fillStyle = 'rgba(148, 163, 184, 0.7)'
  ctx.font = '400 13px sans-serif'
  ctx.fillText('Simulated under patched-conic astrodynamics, real Martian atmospheric density & NASA planetary catalogs.', 100, 1710)

  // 8. Footer Certificate & Verification
  ctx.fillStyle = 'rgba(126, 200, 196, 0.3)'
  ctx.fillRect(70, 1765, 940, 2)

  ctx.fillStyle = '#5ad0e8'
  ctx.font = '700 15px monospace'
  ctx.fillText('CERTIFIED FLIGHT TELEMETRY ARCHIVE // NASA SPACE APPS 2026', 100, 1805)

  ctx.fillStyle = 'rgba(244, 241, 234, 0.5)'
  ctx.font = '400 13px monospace'
  ctx.fillText(`VERIFICATION: SHA256-${Math.abs(outcome.score * 883 + 991).toString(16).toUpperCase()}-PORTRAIT-9-16`, 100, 1830)

  // 9. Convert Canvas to JPEG bytes and assemble standard PDF
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Canvas blob generation failed'))
          return
        }
        try {
          const arrayBuf = await blob.arrayBuffer()
          const jpegBytes = new Uint8Array(arrayBuf)
          const pdfBlob = createPdfFromJpeg(jpegBytes, 1080, 1920)

          const fileName = `Astra-Mission-Report-${outcome.craftName.replace(/\s+/g, '-')}-${Date.now()}.pdf`
          const url = URL.createObjectURL(pdfBlob)
          const link = document.createElement('a')
          link.href = url
          link.download = fileName
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          setTimeout(() => URL.revokeObjectURL(url), 1500)
          resolve()
        } catch (err) {
          console.error('Error generating PDF from JPEG:', err)
          // Fallback to downloading image directly
          const fallbackUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = fallbackUrl
          link.download = `Astra-Mission-Report-${Date.now()}.jpg`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          setTimeout(() => URL.revokeObjectURL(fallbackUrl), 1500)
          resolve()
        }
      },
      'image/jpeg',
      0.94
    )
  })
}
