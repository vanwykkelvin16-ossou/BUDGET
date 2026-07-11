/**
 * Budget settings: salary, pay date, bucket splits, Fun Fund size,
 * categories manager and recurring items (debit orders).
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { adjustSplit, allocateIncome } from '../lib/engine/allocate'
import { formatRands, randsToCents } from '../lib/money'
import type { Bucket, IncomeSource, RecurringItem } from '../lib/data/types'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../lib/data/defaults'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { Sheet } from '../components/ui/Sheet'
import { CategoryBadge } from '../components/ui/CategoryBadge'

export function Settings() {
  const data = useAppStore((s) => s.data)
  const updateProfile = useAppStore((s) => s.updateProfile)
  const profile = data.profile
  if (!profile) return null

  return (
    <Screen>
      <div className="flex items-center gap-3 mb-4">
        <Link
          to="/profile"
          className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                     flex items-center justify-center font-display font-extrabold"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="font-display font-extrabold text-2xl">Budget settings</h1>
      </div>

      <AccountCard />
      <MoneyRow
        label="💼 Monthly salary"
        cents={profile.salaryCents}
        onSave={(cents) => void updateProfile({ salaryCents: cents })}
      />
      <PayDateRow payDate={profile.payDate} onSave={(d) => void updateProfile({ payDate: d })} />
      <SplitsCard />
      <FunFundCard />
      <CategoriesCard />
      <RecurringCard />
    </Screen>
  )
}

/* ------------------------------------------------------------------ */

function AccountCard() {
  const profile = useAppStore((s) => s.data.profile)!
  const updateProfile = useAppStore((s) => s.updateProfile)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    displayName: '',
    surname: '',
    username: '',
    email: '',
    phone: '',
  })

  function openSheet() {
    setDraft({
      displayName: profile.displayName,
      surname: profile.surname,
      username: profile.username,
      email: profile.email,
      phone: profile.phone,
    })
    setOpen(true)
  }

  const valid =
    draft.displayName.trim().length >= 2 &&
    draft.surname.trim().length >= 2 &&
    /^[a-zA-Z0-9_.]{3,20}$/.test(draft.username.trim()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.email.trim()) &&
    draft.phone.replace(/\D/g, '').length >= 9

  async function save() {
    if (!valid) return
    await updateProfile({
      displayName: draft.displayName.trim(),
      surname: draft.surname.trim(),
      username: draft.username.trim().toLowerCase(),
      email: draft.email.trim().toLowerCase(),
      phone: draft.phone.trim(),
    })
    setOpen(false)
  }

  const field = (key: keyof typeof draft, label: string, type = 'text') => (
    <label className="block">
      <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">{label}</p>
      <input
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        type={type}
        maxLength={40}
        className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                   font-semibold focus:border-accent"
      />
    </label>
  )

  return (
    <Card className="mb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-extrabold text-sm truncate">
            🙋 {profile.displayName} {profile.surname}
            {profile.username && (
              <span className="text-accent-soft font-body font-bold text-xs ml-1.5">
                @{profile.username}
              </span>
            )}
          </p>
          <p className="text-[10px] text-ink-faint font-bold truncate">
            {[profile.email, profile.phone].filter(Boolean).join(' · ') || 'Add your details'}
          </p>
        </div>
        <button onClick={openSheet} className="font-display font-extrabold text-accent-soft shrink-0">
          ✎
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Your account">
        <div className="flex flex-col gap-3 pb-2">
          <div className="grid grid-cols-2 gap-3">
            {field('displayName', 'First name')}
            {field('surname', 'Surname')}
          </div>
          {field('username', 'Username')}
          {field('email', 'Email', 'email')}
          {field('phone', 'Phone', 'tel')}
          {!valid && (
            <p className="text-xs text-coral font-bold">
              All fields are required — username 3+ chars, valid email, 9+ digit phone.
            </p>
          )}
          <Button3D full disabled={!valid} onClick={() => void save()}>
            Save account
          </Button3D>
        </div>
      </Sheet>
    </Card>
  )
}

function MoneyRow({
  label,
  cents,
  onSave,
  hint,
}: {
  label: string
  cents: number
  onSave: (cents: number) => void
  hint?: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  return (
    <Card className="mb-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display font-extrabold text-sm">{label}</p>
          {hint && <p className="text-[10px] text-ink-faint font-bold">{hint}</p>}
        </div>
        {editing ? (
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder={String(Math.round(cents / 100))}
              className="w-28 px-3 py-2 rounded-xl bg-bg-deep border border-edge outline-none
                         font-display font-extrabold text-right focus:border-accent"
            />
            <Button3D
              size="sm"
              variant="lime"
              onClick={() => {
                const next = randsToCents(value)
                if (next > 0) onSave(next)
                setEditing(false)
                setValue('')
              }}
            >
              ✓
            </Button3D>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="font-display font-extrabold text-accent-soft"
          >
            {formatRands(cents)} ✎
          </button>
        )}
      </div>
    </Card>
  )
}

function PayDateRow({ payDate, onSave }: { payDate: number; onSave: (d: number) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="mb-3">
      <div className="flex items-center justify-between">
        <p className="font-display font-extrabold text-sm">📅 Payday / cycle start</p>
        <button onClick={() => setOpen(true)} className="font-display font-extrabold text-accent-soft">
          the {payDate}th ✎
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pick your payday">
        <div className="grid grid-cols-7 gap-1.5 pb-2">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
            <button
              key={day}
              onClick={() => {
                onSave(day)
                setOpen(false)
              }}
              className={[
                'h-11 rounded-xl font-display font-extrabold text-sm border-b-4',
                day === payDate
                  ? 'bg-gradient-to-b from-violet-soft to-violet text-white border-violet-deep'
                  : 'bg-bg-deep border-edge-strong text-ink-soft',
              ].join(' ')}
            >
              {day}
            </button>
          ))}
        </div>
      </Sheet>
    </Card>
  )
}

const BUCKET_LABEL: Record<Bucket, string> = { need: 'Needs', want: 'Wants', saving: 'Savings' }

function SplitsCard() {
  const profile = useAppStore((s) => s.data.profile)!
  const updateProfile = useAppStore((s) => s.updateProfile)
  const preview = allocateIncome(profile.salaryCents, profile.splits)

  return (
    <Card className="mb-3">
      <p className="font-display font-extrabold text-sm mb-2">🎚️ Bucket split</p>
      {(Object.keys(BUCKET_LABEL) as Bucket[]).map((bucket) => (
        <div key={bucket} className="mb-2">
          <div className="flex justify-between text-xs font-bold">
            <span>{BUCKET_LABEL[bucket]}</span>
            <span className="text-accent-soft">
              {profile.splits[bucket]}% · {formatRands(preview[bucket])}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={profile.splits[bucket]}
            onChange={(e) =>
              void updateProfile({
                splits: adjustSplit(profile.splits, bucket, Number(e.target.value)),
              })
            }
            className="w-full accent-(--color-accent)"
            aria-label={`${BUCKET_LABEL[bucket]} percentage`}
          />
        </div>
      ))}
    </Card>
  )
}

function FunFundCard() {
  const profile = useAppStore((s) => s.data.profile)!
  const updateProfile = useAppStore((s) => s.updateProfile)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(profile.funFundName)
  const [note, setNote] = useState(profile.funFundNote)
  const [amount, setAmount] = useState('')

  async function save() {
    const cents = amount.trim() ? randsToCents(amount) : profile.funFundCents
    await updateProfile({
      funFundName: name.trim() || 'date nights',
      funFundNote: note.trim() || 'Fun Fund',
      funFundCents: cents > 0 ? cents : profile.funFundCents,
    })
    setAmount('')
    setOpen(false)
  }

  return (
    <Card className="mb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-extrabold text-sm">
            ❤️ {profile.funFundNote} — "{profile.funFundName}"
          </p>
          <p className="text-[10px] text-ink-faint font-bold">
            Your guilt-free sub-budget inside Wants
          </p>
        </div>
        <button
          onClick={() => {
            setName(profile.funFundName)
            setNote(profile.funFundNote)
            setAmount('')
            setOpen(true)
          }}
          className="font-display font-extrabold text-accent-soft shrink-0"
        >
          {formatRands(profile.funFundCents)} ✎
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Make the Fun Fund yours">
        <div className="flex flex-col gap-4">
          <label className="block">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">
              What's it for?
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="date nights"
              maxLength={30}
              className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                         font-semibold placeholder:text-ink-faint focus:border-accent"
            />
            <p className="text-[10px] text-ink-faint font-bold mt-1">
              Shows on the dashboard: "R 850 left for {name.trim() || 'date nights'}"
            </p>
          </label>
          <label className="block">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">
              Description
            </p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Fun Fund"
              maxLength={40}
              className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                         font-semibold placeholder:text-ink-faint focus:border-accent"
            />
          </label>
          <label className="block">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">
              Budget per cycle (R)
            </p>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={String(Math.round(profile.funFundCents / 100))}
              className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                         font-display font-extrabold text-lg focus:border-accent"
            />
          </label>
          <Button3D full onClick={() => void save()}>
            Save Fun Fund
          </Button3D>
        </div>
      </Sheet>
    </Card>
  )
}

function CategoriesCard() {
  const categories = useAppStore((s) => s.data.categories)
  const addCategory = useAppStore((s) => s.addCategory)
  const deleteCategory = useAppStore((s) => s.deleteCategory)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(CATEGORY_ICONS[12])
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [bucket, setBucket] = useState<Bucket>('want')
  const [isFunFund, setIsFunFund] = useState(false)

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

  async function save() {
    if (!name.trim()) return
    await addCategory({ name, icon, color, bucket, isFunFund })
    setName('')
    setOpen(false)
  }

  return (
    <Card className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="font-display font-extrabold text-sm">🏷️ Categories</p>
        <Button3D size="sm" variant="ghost" onClick={() => setOpen(true)}>
          + Custom
        </Button3D>
      </div>
      <div className="flex flex-wrap gap-2">
        {sorted.map((cat) => (
          <span
            key={cat.id}
            className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-bg-deep border border-edge text-xs font-bold"
          >
            <CategoryBadge category={cat} size={22} />
            {cat.name}
            <span className="text-[9px] uppercase text-ink-faint">{cat.bucket}</span>
            {cat.isCustom && (
              <button
                onClick={() => void deleteCategory(cat.id)}
                className="text-coral font-extrabold ml-0.5"
                aria-label={`delete ${cat.name}`}
              >
                ✕
              </button>
            )}
          </span>
        ))}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Custom category">
        <div className="flex flex-col gap-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            maxLength={24}
            className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                       font-semibold placeholder:text-ink-faint focus:border-accent"
          />
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ICONS.slice(12).map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={`w-10 h-10 rounded-xl text-lg border-2 ${
                  icon === i ? 'border-accent bg-accent/15' : 'border-edge bg-bg-deep'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`colour ${c}`}
                className={`w-8 h-8 rounded-full border-4 ${
                  color === c ? 'border-ink' : 'border-transparent'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {(Object.keys(BUCKET_LABEL) as Bucket[]).map((b) => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`flex-1 py-2 rounded-2xl font-display font-extrabold text-sm border-2 ${
                  bucket === b ? 'border-accent bg-accent/15 text-accent-soft' : 'border-edge bg-bg-deep text-ink-faint'
                }`}
              >
                {BUCKET_LABEL[b]}
              </button>
            ))}
          </div>
          {bucket === 'want' && (
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={isFunFund}
                onChange={(e) => setIsFunFund(e.target.checked)}
                className="w-4 h-4 accent-(--color-accent)"
              />
              ❤️ Counts toward the Fun Fund
            </label>
          )}
          <Button3D full onClick={() => void save()}>
            Add category
          </Button3D>
        </div>
      </Sheet>
    </Card>
  )
}

const SOURCES: IncomeSource[] = ['salary', 'freelance', 'dividends', 'refund', 'gift', 'other']

function RecurringCard() {
  const data = useAppStore((s) => s.data)
  const addRecurring = useAppStore((s) => s.addRecurring)
  const updateRecurring = useAppStore((s) => s.updateRecurring)
  const deleteRecurring = useAppStore((s) => s.deleteRecurring)

  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<RecurringItem['kind']>('expense')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState(1)
  const [categoryId, setCategoryId] = useState('cat-housing')
  const [source, setSource] = useState<IncomeSource>('salary')

  const catById = new Map(data.categories.map((c) => [c.id, c]))

  async function save() {
    const cents = randsToCents(amount)
    if (!name.trim() || cents <= 0) return
    await addRecurring({
      kind,
      name,
      amountCents: cents,
      dayOfMonth: day,
      categoryId: kind === 'expense' ? categoryId : undefined,
      source: kind === 'income' ? source : undefined,
    })
    setName('')
    setAmount('')
    setOpen(false)
  }

  return (
    <Card className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-display font-extrabold text-sm">🔁 Recurring / debit orders</p>
          <p className="text-[10px] text-ink-faint font-bold">
            Shows in your dashboard &amp; home page when its day hits
          </p>
        </div>
        <Button3D size="sm" variant="ghost" onClick={() => setOpen(true)}>
          + Add
        </Button3D>
      </div>

      {data.recurring.length === 0 && (
        <p className="text-xs text-ink-soft py-2">
          Rent, medical aid, insurance, Netflix… add them once, never log them again.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {data.recurring.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-2 text-sm ${item.active ? '' : 'opacity-40'}`}
          >
            <span className="text-lg">
              {item.kind === 'income' ? '💰' : catById.get(item.categoryId ?? '')?.icon ?? '📦'}
            </span>
            <span className="font-bold flex-1 truncate">{item.name}</span>
            <span className="text-xs text-ink-faint font-bold">d{item.dayOfMonth}</span>
            <span className={`font-display font-extrabold ${item.kind === 'income' ? 'text-lime' : 'text-coral'}`}>
              {formatRands(item.amountCents)}
            </span>
            <button
              onClick={() => void updateRecurring(item.id, { active: !item.active })}
              className="text-xs font-bold text-aqua px-1"
            >
              {item.active ? '⏸' : '▶️'}
            </button>
            <button
              onClick={() => void deleteRecurring(item.id)}
              className="text-coral font-extrabold px-1"
              aria-label={`delete ${item.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Recurring item">
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`flex-1 py-2 rounded-2xl font-display font-extrabold text-sm border-2 ${
                  kind === k ? 'border-accent bg-accent/15 text-accent-soft' : 'border-edge bg-bg-deep text-ink-faint'
                }`}
              >
                {k === 'expense' ? '📤 Expense' : '📥 Income'}
              </button>
            ))}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (Rent, Medical aid…)"
            maxLength={30}
            className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                       font-semibold placeholder:text-ink-faint focus:border-accent"
          />
          <div className="flex gap-3">
            <label className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">Amount (R)</p>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="950"
                className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                           font-display font-extrabold focus:border-accent"
              />
            </label>
            <label className="w-28">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-faint mb-1">Day</p>
              <input
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                           font-display font-extrabold focus:border-accent"
              />
            </label>
          </div>
          {kind === 'expense' ? (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none font-semibold"
            >
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as IncomeSource)}
              className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none font-semibold"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <Button3D full onClick={() => void save()}>
            Save
          </Button3D>
        </div>
      </Sheet>
    </Card>
  )
}
