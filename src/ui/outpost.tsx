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

export function OutpostScreen() {
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
    bankSurface(report.flyable ? 40 : 12, `Filed from the ${mission.destination} outpost.`)
    finish()
  }
  return (
    <I18nProvider manageDocument={false}>
      <App seed={seed} onFile={file} craft={craft} missionId={mission.id} skin="astra" />
    </I18nProvider>
  )
}
