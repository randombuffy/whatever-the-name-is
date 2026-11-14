import { useState } from 'react'
import { Plus, Minus, Info, Eye, EyeOff, Trash2 } from 'lucide-react'
import type { ComponentSpec } from '../domain/types'
import type { PartFamily } from './families'
import { CATEGORIES, getPartCategory, getPartIcon, plainSpec } from './themeTokens'
import { PartPreview } from './partPreview'

function shortMoney(usd: number): string {
  const abs = Math.abs(usd)
  const sign = usd < 0 ? '-' : ''
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}$${Math.round(abs / 1e6)}M`
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`
  return `${sign}$${Math.round(abs)}`
}

export interface PartCardProps {
  mode: 'catalog' | 'fitted'
  item: ComponentSpec
  count?: number
  selected?: boolean
  enabled?: boolean
  family?: PartFamily
  fill?: number
  instanceId?: string
  onSelect?: () => void
  onAdd?: () => void
  onRemove?: () => void
  onToggle?: () => void
  onInfo?: () => void
  onSetFill?: (fill: number) => void
  onSelectVariant?: (specId: string) => void
  onHover?: (specId: string | null, instanceId?: string | null) => void
}

export function PartCard({
  mode,
  item,
  count = 0,
  selected = false,
  enabled = true,
  family,
  fill,
  instanceId,
  onSelect,
  onAdd,
  onRemove,
  onToggle,
  onInfo,
  onSetFill,
  onSelectVariant,
  onHover,
}: PartCardProps) {
  const [justAdded, setJustAdded] = useState(false)
  const category = CATEGORIES[getPartCategory(item)]
  const Icon = getPartIcon(item.id)

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation()
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 600)
    onAdd?.()
  }

  const handleMouseEnter = () => {
    onHover?.(item.id, instanceId ?? null)
  }

  const handleMouseLeave = () => {
    onHover?.(null, null)
  }

  // Variant index for family slider
  const familyIndex = family ? Math.max(0, family.ids.indexOf(item.id)) : 0

  return (
    <div
      className={`part-card ${selected ? 'is-selected' : ''} ${!enabled ? 'is-disabled' : ''} ${justAdded ? 'is-flashing' : ''}`}
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ '--category-color': category.color, '--category-bg': category.bg } as React.CSSProperties}
    >
      <div className="part-card-main">
        {/* Visual Icon Badge & Preview */}
        <div className="part-card-visual" style={{ borderColor: category.border, backgroundColor: category.bg }}>
          <div className="part-card-icon-wrap" style={{ color: category.color }}>
            <Icon size={24} strokeWidth={2} />
          </div>
          <div className="part-card-preview-thumb">
            <PartPreview specId={item.id} />
          </div>
        </div>

        {/* Info & Plain Specs */}
        <div className="part-card-body">
          <div className="part-card-title-row">
            <strong className="part-card-name" title={item.name}>{item.name}</strong>
            <span className="part-card-cost-badge">{shortMoney(item.costUsd)}</span>
          </div>

          <p className="part-card-spec">{plainSpec(item)}</p>

          {/* Family Variant Slider if available */}
          {family && family.ids.length > 1 && (
            <div className="part-card-slider-row" onClick={(e) => e.stopPropagation()}>
              <div className="part-card-slider-label">
                <span>Size:</span>
                <strong>{item.name.replace(family.name, '').trim() || item.name}</strong>
              </div>
              <input
                className="part-card-slider"
                type="range"
                min={0}
                max={family.ids.length - 1}
                step={1}
                value={familyIndex}
                aria-label={`${family.name} size`}
                onChange={(e) => {
                  const targetId = family.ids[Number(e.target.value)]
                  if (targetId && onSelectVariant) onSelectVariant(targetId)
                }}
              />
            </div>
          )}

          {/* Fuel fill slider if tank */}
          {mode === 'fitted' && typeof fill === 'number' && item.tankCapacityKg > 0 && onSetFill && (
            <div className="part-card-slider-row" onClick={(e) => e.stopPropagation()}>
              <div className="part-card-slider-label">
                <span>Fuel Fill:</span>
                <strong>{Math.round(fill * 100)}% ({Math.round(fill * item.tankCapacityKg)} kg)</strong>
              </div>
              <input
                className="part-card-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={fill}
                aria-label={`${item.name} propellant fill`}
                onChange={(e) => onSetFill(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="part-card-actions">
          {mode === 'catalog' ? (
            <>
              {count > 0 ? (
                <div className="part-card-qty-ctrl" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="part-card-qty-btn"
                    title={`Remove one ${item.name}`}
                    aria-label={`Remove one ${item.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove?.()
                    }}
                  >
                    <Minus size={14} strokeWidth={2.5} />
                  </button>
                  <span className="part-card-qty-val" title={`${count} fitted`}>{count}</span>
                  <button
                    type="button"
                    className="part-card-qty-btn add"
                    title={`Add another ${item.name}`}
                    aria-label={`Add another ${item.name}`}
                    onClick={handleAdd}
                  >
                    <Plus size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="part-card-add-btn"
                  title={`Add ${item.name} to spacecraft`}
                  aria-label={`Add ${item.name}`}
                  onClick={handleAdd}
                >
                  <Plus size={18} strokeWidth={2.5} />
                </button>
              )}
              {onInfo && (
                <button
                  type="button"
                  className="part-card-info-btn"
                  title={`Details for ${item.name}`}
                  aria-label={`About ${item.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onInfo()
                  }}
                >
                  <Info size={14} />
                </button>
              )}
            </>
          ) : (
            <>
              {onToggle && (
                <button
                  type="button"
                  className={`part-card-icon-btn ${enabled ? 'active' : ''}`}
                  title={enabled ? `Disable ${item.name}` : `Enable ${item.name}`}
                  aria-label={enabled ? 'Disable' : 'Enable'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle()
                  }}
                >
                  {enabled ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  className="part-card-icon-btn danger"
                  title={`Remove ${item.name}`}
                  aria-label={`Remove ${item.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove()
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
