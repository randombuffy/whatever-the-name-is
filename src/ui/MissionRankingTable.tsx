import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { MissionOutcome } from '../domain/types'
import { DataTable } from '../components/ui/data-table'
import { useMission } from '../store/useMission'

type RankRow = MissionOutcome & { place: number; current: boolean }

const columns: ColumnDef<RankRow, unknown>[] = [
  {
    accessorKey: 'place',
    header: '#',
    size: 36,
    cell: ({ row }) => <span className="ui-table-rank">{row.original.place}</span>,
  },
  {
    accessorKey: 'craftName',
    header: 'Ship',
    cell: ({ row }) => <span className="ui-table-strong">{row.original.craftName}</span>,
  },
  {
    accessorKey: 'score',
    header: 'Score',
    size: 64,
    cell: ({ row }) => <span className="ui-table-mono">{row.original.score}</span>,
  },
  {
    accessorKey: 'gradeRank',
    header: 'Grade',
    size: 56,
    cell: ({ row }) => (
      <span className={`ui-grade-pill rank-${row.original.gradeRank ?? 'C'}`}>{row.original.gradeRank ?? '—'}</span>
    ),
  },
  {
    id: 'site',
    header: 'Site',
    cell: ({ row }) => (
      <span className="ui-table-muted">{row.original.siteName ?? row.original.missionId}</span>
    ),
  },
]

export function MissionRankingTable({ limit = 6 }: { limit?: number }) {
  const history = useMission((state) => state.history)
  const outcome = useMission((state) => state.outcome)

  const rows = useMemo(() => {
    const ranked = [...history].sort((a, b) => b.score - a.score).slice(0, limit)
    return ranked.map((flight, index) => ({
      ...flight,
      place: index + 1,
      current: Boolean(outcome && outcome.finishedAt === flight.finishedAt && outcome.craftName === flight.craftName),
    }))
  }, [history, limit, outcome])

  if (rows.length < 2) return null

  return (
    <div className="debrief-panel">
      <p className="debrief-panel-label">Mission ranking</p>
      <DataTable
        columns={columns}
        data={rows}
        rowClassName={(row) => (row.current ? 'is-current' : undefined)}
        emptyLabel="No flights yet."
      />
    </div>
  )
}