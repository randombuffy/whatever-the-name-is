import { CONTRACTS, type ContractId } from '../mission/contracts';
import { siteById } from '../mission/sites';
import { useT } from '../i18n';

const ORDER: ContractId[] = ['science', 'endurance', 'speed'];

export function ContractPicker({ value, onChange }: { value: ContractId; onChange: (id: ContractId) => void }) {
  const tr = useT();
  return (
    <div className="contract-picker">
      <div className="contract-options" role="radiogroup" aria-label={tr.t('contract.aria')}>
        <span className="u">{tr.t('contract.kicker')}</span>
        {ORDER.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'is-on' : ''} onClick={() => onChange(id)}>
            {tr.t(`contract.${id}`)}
          </button>
        ))}
      </div>
      <p className="contract-blurb">{tr.m(`contract.${value}`)}</p>
      <p className="contract-suggest u">{tr.t('contract.suggested', { site: siteById(CONTRACTS[value].suggestedSite).name })}</p>
    </div>
  );
}
