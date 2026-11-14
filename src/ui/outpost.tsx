import '../voyage/voyage.css'
import { evaluate } from '../domain/validate'
import { useActiveMission, useMission } from '../store/useMission'
import App from '../voyage/App'
import { I18nProvider } from '../voyage/i18n/I18nProvider'
import { DEFAULT_CONTRACT } from '../voyage/mission/contracts'
import { createSettlement } from '../voyage/mission/settlement'
import { siteById, type SiteId } from '../voyage/mission/sites'
import { tuneFromCraft } from '../voyage/tune'

function voyageSite(id: string | undefined): SiteId {
  if (id === 'utopia') return 'utopia'
  if (id === 'elysium' || id === 'meridiani' || id === 'gale') return 'elysium'
  return 'jezero'
}

export function OutpostScreen({ onReturn }: { onReturn?: () => void } = {}) {
  const mission = useActiveMission()
  const craft = useMission((state) => state.craft)
  const plan = useMission((state) => state.plan)
  const finish = useMission((state) => state.finish)
  const bankSurface = useMission((state) => state.bankSurface)
  const noteTouchdown = useMission((state) => state.noteTouchdown)
  if (!mission || !craft || !plan) return null
  tuneFromCraft(mission, craft, plan)
  const report = evaluate(craft, mission, plan)
  const siteId = voyageSite(plan.siteId)
  const seed = {
    landing: {
      stage: 'SETTLEMENT' as const,
      siteId,
      trajectory: 'direct' as const,
      contractId: DEFAULT_CONTRACT,
      skillGrade: 'clear' as const,
      skipped: true,
      fastForwardRun: null,
      replay: false,
      landed: true,
      run: 1,
    },
    settlement: createSettlement(siteById(siteId), 'direct', { skill: 'clear', contract: DEFAULT_CONTRACT }),
  }
  const file = () => {
    noteTouchdown(report.cost.marginUsd < 0 ? 'hard' : 'soft', 0.2, 0)
    bankSurface(report.flyable ? 50 : 20, `Filed from the ${mission.destination} civilization outpost.`)
    finish()
  }
  return (
    <div className="outpost-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
      {onReturn && (
        <button
          type="button"
          className="outpost-back-btn"
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            color: '#38bdf8',
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '13px',
            fontWeight: 700,
            padding: '6px 14px',
            borderRadius: '4px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
          onClick={onReturn}
        >
          ← Surface Rover / EVA
        </button>
      )}
      <I18nProvider manageDocument={false}>
        <App seed={seed} onFile={file} craft={craft} missionId={mission.id} skin="astra" />
      </I18nProvider>
    </div>
  )
}
