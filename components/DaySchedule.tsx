'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { calculateEndTime, DEFAULT_DAILY_ROUTINE, findScheduleConflicts, parseDailyRoutine, sortAssignedPlaces, timeToMinutes } from '@/lib/schedule'
import type { DailyRoutine, Place, PlaceSchedule } from '@/types/place'

type Props = {
  places: Place[]
  dayAssignments: Record<number, number>
  placeSchedule: Record<number, PlaceSchedule>
  routine: DailyRoutine
  selectedDay: number
  days: { day: number; weekday: string }[]
  onSelectDay: (day: number) => void
  onSavePlaceSchedule: (placeId: number, schedule: PlaceSchedule) => void
  onRemovePlaceSchedule: (placeId: number) => void
  onSaveRoutine: (routine: DailyRoutine) => void
  onChoosePlaces: (day: number) => void
}

type ScheduleForm = { startTime: string; durationMinutes: string; travelMinutes: string; bufferMinutes: string }

function formatEnd(startTime: string, duration: number) {
  return calculateEndTime(startTime, duration) ?? '—'
}

export default function DaySchedule({ places, dayAssignments, placeSchedule, routine, selectedDay, days, onSelectDay, onSavePlaceSchedule, onRemovePlaceSchedule, onSaveRoutine, onChoosePlaces }: Props) {
  const [editingPlaceId, setEditingPlaceId] = useState<number | null>(null)
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({ startTime: '', durationMinutes: '60', travelMinutes: '30', bufferMinutes: '15' })
  const [scheduleError, setScheduleError] = useState('')
  const [editingRoutine, setEditingRoutine] = useState(false)
  const [routineForm, setRoutineForm] = useState<DailyRoutine>(routine ?? DEFAULT_DAILY_ROUTINE)
  const [routineError, setRoutineError] = useState('')
  const assigned = sortAssignedPlaces(places, dayAssignments, placeSchedule, selectedDay)
  const conflicts = findScheduleConflicts(places, dayAssignments, placeSchedule, selectedDay)

  function startEditing(placeId: number) {
    const saved = placeSchedule[placeId]
    setScheduleForm({
      startTime: saved?.startTime ?? '',
      durationMinutes: String(saved?.durationMinutes ?? 60),
      travelMinutes: String(saved?.travelMinutes ?? 30),
      bufferMinutes: String(saved?.bufferMinutes ?? 15),
    })
    setEditingPlaceId(placeId)
    setScheduleError('')
  }

  function savePlaceSchedule(event: FormEvent<HTMLFormElement>, placeId: number) {
    event.preventDefault()
    const durationMinutes = Number(scheduleForm.durationMinutes)
    const travelMinutes = Number(scheduleForm.travelMinutes)
    const bufferMinutes = Number(scheduleForm.bufferMinutes)
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 600) return setScheduleError('La duración debe ser de 15 a 600 minutos.')
    if (!Number.isInteger(travelMinutes) || travelMinutes < 0 || travelMinutes > 360) return setScheduleError('El traslado debe estar entre 0 y 360 minutos.')
    if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 360) return setScheduleError('El margen debe estar entre 0 y 360 minutos.')
    if (scheduleForm.startTime && timeToMinutes(scheduleForm.startTime) === null) return setScheduleError('Escribe una hora válida entre 00:00 y 23:59.')
    if (scheduleForm.startTime && calculateEndTime(scheduleForm.startTime, durationMinutes) === null) return setScheduleError('La visita terminaría después de las 24:00; ajusta la hora o duración.')
    if (scheduleForm.startTime && timeToMinutes(scheduleForm.startTime)! < travelMinutes + bufferMinutes) return setScheduleError('El traslado previo y el margen empezarían antes de la medianoche.')
    onSavePlaceSchedule(placeId, { startTime: scheduleForm.startTime, durationMinutes, travelMinutes, bufferMinutes })
    setEditingPlaceId(null)
    setScheduleError('')
  }

  function updateRoutine<K extends keyof DailyRoutine>(key: K, value: DailyRoutine[K]) {
    setRoutineForm((current) => ({ ...current, [key]: value }))
  }

  function saveRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!parseDailyRoutine(routineForm)) return setRoutineError('Revisa las horas y duraciones; cada bloque debe terminar antes o justo a las 24:00.')
    onSaveRoutine(routineForm)
    setEditingRoutine(false)
    setRoutineError('')
  }

  return <section className="day-schedule" aria-labelledby="day-schedule-title">
    <div className="day-schedule-heading"><div><span className="tiny-label">PROPUESTA EDITABLE</span><h2 id="day-schedule-title">Horarios del día</h2><p>Solo aparecen aquí los lugares que tú asignaste a una fecha.</p></div><label className="schedule-day-select">Día<select value={selectedDay} onChange={(event) => onSelectDay(Number(event.target.value))}>{days.map(({ day, weekday }) => <option key={day} value={day}>{weekday} {day} dic</option>)}</select></label></div>
    <div className="schedule-disclaimer"><b>Propuesta, no reserva.</b> Los horarios de apertura de estos lugares siguen pendientes de verificar con cada fuente.</div>
    {assigned.length ? <div className="schedule-place-list">{assigned.map((place) => {
      const schedule = placeSchedule[place.id]
      const endTime = schedule?.startTime ? calculateEndTime(schedule.startTime, schedule.durationMinutes) : null
      return <article className={`schedule-place ${conflicts.has(place.id) ? 'has-conflict' : ''}`} key={place.id}>
        <div className="schedule-place-main"><div className="schedule-place-title"><span>{String(place.id).padStart(2, '0')}</span><h3>{place.name}</h3></div>
          <div className="schedule-place-times">{schedule?.startTime ? <><b>{schedule.startTime}–{endTime ?? 'hora final por corregir'}</b><span>{schedule.durationMinutes} min de visita · traslado {schedule.travelMinutes} min + margen {schedule.bufferMinutes} min</span></> : <><b>Sin hora</b><span>{schedule ? `${schedule.durationMinutes} min · traslado ${schedule.travelMinutes} min + margen ${schedule.bufferMinutes} min` : 'Duración, traslado y margen por definir'}</span></>}</div>
          <small className="schedule-operating-status">Horario operativo: pendiente de verificar · Datos del lugar: borrador</small>
          {conflicts.has(place.id) && <p className="schedule-conflict" role="status">Posible solapamiento: el traslado previo, el margen o la visita coincide con otro bloque. Ajusta las horas o los tiempos.</p>}
        </div>
        <button type="button" className="schedule-edit-button" onClick={() => startEditing(place.id)}>{schedule ? 'Editar horario' : 'Poner hora'}</button>
        {editingPlaceId === place.id && <form className="schedule-editor" onSubmit={(event) => savePlaceSchedule(event, place.id)}>
          <p>Estimaciones editables. No se calculó la ruta entre estos lugares.</p>
          <div className="schedule-editor-grid">
            <label>Hora de inicio sugerida<input type="time" step="60" value={scheduleForm.startTime} onChange={(event) => setScheduleForm((current) => ({ ...current, startTime: event.target.value }))} /></label>
            <label>Duración de visita (min)<input type="number" min="15" max="600" step="5" value={scheduleForm.durationMinutes} onChange={(event) => setScheduleForm((current) => ({ ...current, durationMinutes: event.target.value }))} /></label>
            <label>Traslado previo aprox. (min)<input type="number" min="0" max="360" step="5" value={scheduleForm.travelMinutes} onChange={(event) => setScheduleForm((current) => ({ ...current, travelMinutes: event.target.value }))} /></label>
            <label>Margen libre aprox. (min)<input type="number" min="0" max="360" step="5" value={scheduleForm.bufferMinutes} onChange={(event) => setScheduleForm((current) => ({ ...current, bufferMinutes: event.target.value }))} /></label>
          </div>
          {scheduleError && <p className="budget-form-error" role="alert">{scheduleError}</p>}
          <div className="schedule-editor-actions"><button type="submit" className="budget-primary-button">Guardar horario</button><button type="button" className="budget-secondary-button" onClick={() => setEditingPlaceId(null)}>Cancelar</button>{schedule && <button type="button" className="budget-remove-button" onClick={() => { onRemovePlaceSchedule(place.id); setEditingPlaceId(null) }}>Quitar horario</button>}</div>
        </form>}
      </article>
    })}</div> : <div className="schedule-empty"><b>Aún no asignaste lugares al {selectedDay} de diciembre.</b><p>Asigna solo los sitios que quieras visitar; después puedes proponerles hora aquí.</p><button type="button" className="text-link" onClick={() => onChoosePlaces(selectedDay)}>Elegir lugares para este día ↗</button></div>}

    <section className="routine-card">
      <div className="routine-heading"><div><span className="tiny-label">PLANTILLA PARA DÍAS DE EXPLORACIÓN · 4–12</span><h3>Una mañana con margen</h3><p>Es una referencia editable, no una obligación; puedes saltarte la carrera para una excursión o descansar. No se copia a la fecha seleccionada ni a días de llegada o traslado.</p></div><button type="button" className="schedule-edit-button" onClick={() => { setRoutineForm(routine ?? DEFAULT_DAILY_ROUTINE); setEditingRoutine((open) => !open); setRoutineError('') }}>{editingRoutine ? 'Cerrar edición' : 'Editar rutina'}</button></div>
      {!editingRoutine ? <div className="routine-list">
        <div><b>{routine.wakeTime}</b><span>Despertar</span></div>
        <div><b>{routine.runStartTime}–{formatEnd(routine.runStartTime, routine.runDurationMinutes)}</b><span>Correr · duración editable (referencia 4–10 km)</span></div>
        <div><b>{routine.breakfastStartTime}–{formatEnd(routine.breakfastStartTime, routine.breakfastDurationMinutes)}</b><span>Desayuno y ducha</span></div>
        <div><b>{routine.departurePrepStartTime}–{formatEnd(routine.departurePrepStartTime, routine.departurePrepDurationMinutes)}</b><span>Preparar salida y traslado</span></div>
        <div><b>{routine.lunchStartTime}–{formatEnd(routine.lunchStartTime, routine.lunchDurationMinutes)}</b><span>Comida y descanso</span></div>
      </div> : <form className="routine-editor" onSubmit={saveRoutine}>
        <div className="routine-edit-row"><b>Despertar</b><label>Hora<input type="time" step="60" value={routineForm.wakeTime} onChange={(event) => updateRoutine('wakeTime', event.target.value)} /></label></div>
        <div className="routine-edit-row"><b>Correr</b><label>Inicio<input type="time" step="60" value={routineForm.runStartTime} onChange={(event) => updateRoutine('runStartTime', event.target.value)} /></label><label>Duración (min)<input type="number" min="10" max="240" step="5" value={routineForm.runDurationMinutes} onChange={(event) => updateRoutine('runDurationMinutes', Number(event.target.value))} /></label></div>
        <div className="routine-edit-row"><b>Desayuno y ducha</b><label>Inicio<input type="time" step="60" value={routineForm.breakfastStartTime} onChange={(event) => updateRoutine('breakfastStartTime', event.target.value)} /></label><label>Duración (min)<input type="number" min="10" max="240" step="5" value={routineForm.breakfastDurationMinutes} onChange={(event) => updateRoutine('breakfastDurationMinutes', Number(event.target.value))} /></label></div>
        <div className="routine-edit-row"><b>Preparar traslado</b><label>Inicio<input type="time" step="60" value={routineForm.departurePrepStartTime} onChange={(event) => updateRoutine('departurePrepStartTime', event.target.value)} /></label><label>Duración (min)<input type="number" min="10" max="240" step="5" value={routineForm.departurePrepDurationMinutes} onChange={(event) => updateRoutine('departurePrepDurationMinutes', Number(event.target.value))} /></label></div>
        <div className="routine-edit-row"><b>Comida y descanso</b><label>Inicio<input type="time" step="60" value={routineForm.lunchStartTime} onChange={(event) => updateRoutine('lunchStartTime', event.target.value)} /></label><label>Duración (min)<input type="number" min="10" max="240" step="5" value={routineForm.lunchDurationMinutes} onChange={(event) => updateRoutine('lunchDurationMinutes', Number(event.target.value))} /></label></div>
        {routineError && <p className="budget-form-error" role="alert">{routineError}</p>}
        <div className="schedule-editor-actions"><button type="submit" className="budget-primary-button">Guardar rutina</button><button type="button" className="budget-secondary-button" onClick={() => setEditingRoutine(false)}>Cancelar</button></div>
      </form>}
    </section>
  </section>
}
