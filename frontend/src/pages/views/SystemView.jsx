import { useMaritime } from '../../state/MaritimeContext.jsx'
import { OfflineBanner } from '../../components/ops/StatusBar.jsx'

function DiagRow({ k, v }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1 text-[12px] last:border-0">
      <span className="font-mono-tech text-slate-400">{k}</span>
      <span className="font-mono-tech break-all text-right text-slate-100">{v}</span>
    </div>
  )
}

/** /dashboard/system — full data-source + model health + AIS pipeline diagnostics. */
export default function SystemView() {
  const m = useMaritime()
  const d = m.health?.diagnostics || {}
  const ow = d.providers?.openwaters || m.health?.sources?.openwaters?.diagnostics || {}
  const va = d.providers?.vesselapi || m.health?.sources?.vesselapi?.diagnostics || {}
  const agg = m.aggregation || m.health?.aggregation || {}
  const fmtAge = (s) => (s == null ? 'never' : s < 60 ? `${Math.round(s)}s ago` : `${(s / 60).toFixed(1)}m ago`)
  return (
    <div className="sd-dash space-y-4">
      <div>
        <p className="eyebrow text-cyan-200/80">SYSTEM STATUS</p>
        <h1 className="font-display text-2xl font-extrabold text-white">Data Sources & Models</h1>
        <p className="mt-1 text-xs text-slate-400">Live connectivity, freshness and model readiness. Historical sources are labeled historical — never live. Connection success is reported separately from data availability.</p>
      </div>
      <OfflineBanner />
      {!m.apiOnline && (
        <button type="button" onClick={m.retry} className="rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 font-mono-tech text-xs text-cyan-100 hover:bg-cyan-300/20">RETRY CONNECTION</button>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="region" aria-label="System health">
        {m.sourceHealth.map(([k, h]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <p className="font-mono-tech text-xs text-cyan-200">{k}</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-bold" style={{ color: h.color }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: h.color }} aria-hidden />{h.state}
            </p>
            <p className="mt-1 text-xs text-slate-400">{h.role}</p>
            <p className="font-mono-tech mt-1 text-[11px] text-slate-500">{h.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" role="region" aria-label="AIS pipeline diagnostics">
        <p className="eyebrow text-slate-400">AIS PIPELINE DIAGNOSTICS · {m.aisLabel[0]}</p>
        <p className="mt-1 text-[11px] text-slate-500">Backend-owned AIS connections (browser never contacts providers). AISStream key present server-side: {d.providers?.aisstream?.api_key_present == null ? (d.api_key_present == null ? 'unknown' : String(d.api_key_present)) : String(d.providers.aisstream.api_key_present)} · Open Waters auth: {ow.auth_mode || (ow.api_key_present ? 'token' : 'anonymous')} · Credentials never leave the server.</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <div>
            <p className="font-mono-tech mb-1 text-[11px] text-cyan-200">CONNECTION & SUBSCRIPTION</p>
            <DiagRow k="websocket attempted" v={d.websocket_attempted == null ? '—' : String(d.websocket_attempted)} />
            <DiagRow k="websocket connected" v={d.websocket_connected == null ? '—' : String(d.websocket_connected)} />
            <DiagRow k="subscription sent" v={d.subscription_sent == null ? '—' : `${String(d.subscription_sent)} ×${d.subscription_sent_count ?? 0}`} />
            <DiagRow k="subscription ack (frames)" v={d.subscription_ack == null ? '—' : String(d.subscription_ack)} />
            <DiagRow k="compression" v={d.compression || '—'} />
            <DiagRow k="reconnects" v={d.reconnects ?? '—'} />
            <DiagRow k="connection attempts" v={d.connection_attempts ?? '—'} />
            <DiagRow k="boxes" v={Array.isArray(d.bounding_boxes) ? String(d.bounding_boxes.length) : '—'} />
          </div>
          <div>
            <p className="font-mono-tech mb-1 text-[11px] text-cyan-200">MESSAGE FLOW</p>
            <DiagRow k="raw messages" v={d.raw_messages ?? '—'} />
            <DiagRow k="PositionReport (A)" v={d.position_report ?? '—'} />
            <DiagRow k="Class-B std" v={d.class_b_std ?? '—'} />
            <DiagRow k="Class-B ext" v={d.class_b_ext ?? '—'} />
            <DiagRow k="ShipStaticData" v={d.ship_static ?? '—'} />
            <DiagRow k="unknown types" v={d.unknown_messages ?? '—'} />
            <DiagRow k="parse errors" v={d.parse_errors ?? '—'} />
            <DiagRow k="invalid records" v={d.invalid_records ?? '—'} />
            <DiagRow k="india-region msgs" v={d.india_region_messages ?? '—'} />
            <DiagRow k="outside-region msgs" v={d.outside_region_messages ?? '—'} />
            <DiagRow k="vessels cached" v={d.vessels_cached ?? m.health.vessels_tracked ?? '—'} />
          </div>
          <div>
            <p className="font-mono-tech mb-1 text-[11px] text-cyan-200">FRESHNESS & ERRORS</p>
            <DiagRow k="last message" v={d.last_message ? `${d.last_message} (${fmtAge(d.last_message_age_s)})` : 'never'} />
            <DiagRow k="last position" v={d.last_position ? `${d.last_position} (${fmtAge(d.last_position_age_s)})` : 'never'} />
            <DiagRow k="last connected" v={d.last_connected || m.health.last_connected || 'never'} />
            <DiagRow k="events/min" v={m.stats.epm ?? '—'} />
            <DiagRow k="last error" v={d.last_error ? String(d.last_error).slice(0, 120) : 'none'} />
            <DiagRow k="auth error" v={d.auth_error ? String(d.auth_error).slice(0, 120) : 'none'} />
            <DiagRow k="subscription error" v={d.subscription_error ? String(d.subscription_error).slice(0, 120) : 'none'} />
            <DiagRow k="stream error" v={d.stream_error ? String(d.stream_error).slice(0, 120) : 'none'} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" role="region" aria-label="Open Waters diagnostics">
        <p className="eyebrow text-slate-400">OPEN WATERS DIAGNOSTICS · {m.aisSources.find((s) => s.id === 'openwaters')?.status || '—'} · {ow.auth_mode === 'token' ? 'authenticated token (backend-only)' : ow.api_key_present ? 'authenticated token (backend-only)' : 'anonymous, no key required'}</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <div>
            <p className="font-mono-tech mb-1 text-[11px] text-cyan-200">STREAM TRANSPORT</p>
            <DiagRow k="stream attempted" v={ow.stream_attempted == null ? '—' : String(ow.stream_attempted)} />
            <DiagRow k="stream connected" v={ow.stream_connected == null ? '—' : String(ow.stream_connected)} />
            <DiagRow k="subscription ack" v={ow.subscription_ack == null ? '—' : String(ow.subscription_ack)} />
            <DiagRow k="stream reconnects" v={ow.stream_reconnects ?? '—'} />
            <DiagRow k="stream messages" v={ow.stream_messages ?? '—'} />
            <DiagRow k="stream positions" v={ow.stream_positions ?? '—'} />
            <DiagRow k="last stream msg" v={ow.last_stream_message ? `${ow.last_stream_message} (${fmtAge(ow.last_stream_message_age_s)})` : 'never'} />
          </div>
          <div>
            <p className="font-mono-tech mb-1 text-[11px] text-cyan-200">POLL TRANSPORT</p>
            <DiagRow k="poll runs" v={ow.poll_runs ?? '—'} />
            <DiagRow k="poll vessels seen" v={ow.poll_vessels_seen ?? '—'} />
            <DiagRow k="poll errors" v={ow.poll_errors ?? '—'} />
            <DiagRow k="last poll ok" v={ow.last_poll_ok || 'never'} />
            <DiagRow k="rate limited" v={ow.rate_limited == null ? '—' : String(ow.rate_limited)} />
            <DiagRow k="parse errors" v={ow.parse_errors ?? '—'} />
            <DiagRow k="invalid records" v={ow.invalid_records ?? '—'} />
          </div>
          <div>
            <p className="font-mono-tech mb-1 text-[11px] text-cyan-200">AGGREGATION</p>
            <DiagRow k="unique vessels" v={agg.unique_vessels ?? '—'} />
            <DiagRow k="from Open Waters" v={agg.from_openwaters ?? '—'} />
            <DiagRow k="from AISStream" v={agg.from_aisstream ?? '—'} />
            <DiagRow k="from VesselAPI" v={agg.from_vesselapi ?? '—'} />
            <DiagRow k="OW + AS" v={agg.from_openwaters_aisstream ?? '—'} />
            <DiagRow k="OW + VA" v={agg.from_openwaters_vesselapi ?? '—'} />
            <DiagRow k="AS + VA" v={agg.from_aisstream_vesselapi ?? '—'} />
            <DiagRow k="all three" v={agg.from_all_three ?? '—'} />
            <DiagRow k="live / stale" v={`${agg.vessels_live ?? '—'} / ${agg.vessels_stale ?? '—'}`} />
            <DiagRow k="newest position" v={agg.newest_position || 'never'} />
            <DiagRow k="last error" v={ow.last_error ? String(ow.last_error).slice(0, 120) : 'none'} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" role="region" aria-label="VesselAPI diagnostics">
        <p className="eyebrow text-slate-400">VESSELAPI DIAGNOSTICS · {m.aisSources.find((s) => s.id === 'vesselapi')?.status || '—'} · REST poll, key backend-only</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <div>
            <p className="font-mono-tech mb-1 text-[11px] text-cyan-200">CONFIG & POLL</p>
            <DiagRow k="configured" v={va.configured == null ? '—' : String(va.configured)} />
            <DiagRow k="running" v={va.running == null ? '—' : String(va.running)} />
            <DiagRow k="poll runs" v={va.poll_runs ?? '—'} />
            <DiagRow k="poll vessels seen" v={va.poll_vessels_seen ?? '—'} />
            <DiagRow k="poll interval" v={va.poll_interval_s != null ? `${va.poll_interval_s}s` : '—'} />
            <DiagRow k="last poll ok" v={va.last_poll_ok || 'never'} />
          </div>
          <div>
            <p className="font-mono-tech mb-1 text-[11px] text-cyan-200">QUOTA & ERRORS</p>
            <DiagRow k="quota remaining" v={va.quota_remaining ?? 'unknown'} />
            <DiagRow k="quota exhausted" v={va.quota_exhausted == null ? '—' : String(va.quota_exhausted)} />
            <DiagRow k="rate limited" v={va.rate_limited == null ? '—' : String(va.rate_limited)} />
            <DiagRow k="poll errors" v={va.poll_errors ?? '—'} />
            <DiagRow k="auth failures" v={va.auth_failures ?? '—'} />
            <DiagRow k="glitch filtered" v={va.glitch_filtered ?? '—'} />
            <DiagRow k="last error" v={va.last_error ? String(va.last_error).slice(0, 120) : 'none'} />
          </div>
          <div>
            <p className="font-mono-tech mb-1 text-[11px] text-cyan-200">DATA</p>
            <DiagRow k="vessels cached" v={va.vessels_cached ?? '—'} />
            <DiagRow k="india msgs" v={va.india_region_messages ?? '—'} />
            <DiagRow k="invalid records" v={va.invalid_records ?? '—'} />
            <DiagRow k="last position" v={va.last_position ? `${va.last_position} (${fmtAge(va.last_position_age_s)})` : 'never'} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" role="region" aria-label="Data freshness">
        <p className="eyebrow text-slate-400">DATA FRESHNESS · SOURCE / LAST UPDATED / DATA AGE / STATUS</p>
        <div className="font-mono-tech mt-2 grid grid-cols-4 gap-2 text-[10px] text-slate-500">
          <span>SOURCE</span><span>LAST UPDATED</span><span>DATA AGE</span><span>STATUS</span>
        </div>
        {[
          ['AIS', m.health.last_event ? new Date(m.health.last_event).toISOString() : 'never', m.stats.lastAge != null ? `${Math.round(m.stats.lastAge)}s` : 'no fix yet', m.aisLabel[0]],
          ['GFW', m.sources?.sources?.gfw_latest || 'NO RECENT READING', m.sources?.data_age_days != null ? `${m.sources.data_age_days}d` : 'NO RECENT READING', m.sources?.sources?.gfw || 'NO RECENT READING'],
          ['CMEMS', m.sources?.sources?.cmems_latest || 'NO RECENT READING', m.sources?.data_age_days != null ? `${m.sources.data_age_days}d` : 'NO RECENT READING', m.sources?.sources?.cmems || 'NO RECENT READING'],
          ['NOAA', m.sources?.sources?.noaa_latest || 'NO RECENT READING', 'historical (product ended 2023)', m.sources?.sources?.noaa || 'NO RECENT READING'],
          ['ML MODELS', m.sources?.latest_prediction_date || 'NO RECENT READING', m.sources?.data_age_days != null ? `${m.sources.data_age_days}d` : 'NO RECENT READING', m.predictions.length ? 'READY' : 'NO DATA'],
        ].map(([s, lu, age, st]) => (
          <div key={s} className="font-mono-tech grid grid-cols-4 gap-2 border-t border-white/5 py-1.5 text-[11px] text-slate-200">
            <span className="text-cyan-200">{s}</span><span className="break-all">{lu}</span><span>{age}</span><span>{st}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" role="region" aria-label="Model readiness">
        <p className="eyebrow text-slate-400">MODEL READINESS</p>
        <div className="mt-2 space-y-1 text-sm text-slate-200">
          <p><span className="font-mono-tech text-xs text-cyan-200">daily_traffic_model_v1</span> · {m.predictions.length ? `READY · ${m.predictions.length} port forecasts` : 'Model unavailable.'}</p>
          <p><span className="font-mono-tech text-xs text-cyan-200">daily_congestion_model_v1</span> · {m.predictions.length ? `READY · ${m.predictions.length} port forecasts` : 'Model unavailable.'}</p>
          <p className="font-mono-tech text-[11px] text-slate-500">AIS transport: {m.demo ? 'DEMO overlay (live state preserved)' : `sources=OPENWATERS+AISSTREAM+VESSELAPI · unique=${agg.unique_vessels ?? m.health.vessels_tracked ?? 0} (multi=${agg.from_both ?? 0}, all3=${agg.from_all_three ?? 0}) · mode=MULTI_SOURCE · status=${m.health.ais_status || m.aisState}`}</p>
        </div>
      </div>
    </div>
  )
}
