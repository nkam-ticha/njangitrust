// Public surface of the meetings module (other modules import only from here).
export { cancelMeeting, getMeeting, listMeetings, scheduleMeeting } from './meetings.service';
export {
  addAgendaItem,
  checkIn,
  closeMeeting,
  listAttendance,
  markAttendance,
  sendExcuse,
  type CloseResult,
} from './meetings.attendance';
export { draftMinutes, listMinutes, publishMinutes } from './meetings.minutes';
export {
  meetingAttendanceHandler,
  meetingCancelHandler,
  meetingCloseHandler,
  meetingPublishMinutesHandler,
  meetingScheduleHandler,
  requestCancelMeeting,
  requestCloseMeeting,
  requestMarkAttendance,
  requestPublishMinutes,
  requestScheduleMeeting,
} from './meetings.actions';
export {
  meetingAgendaAddHandler,
  meetingCheckInHandler,
  meetingExcuseHandler,
  requestAgendaItem,
  requestCheckIn,
  requestExcuse,
} from './meetings.member-actions';
export {
  generateAgenda,
  generateDueAgendas,
  meetingReminders,
  registerMeetingJobs,
} from './meetings.jobs';
export {
  registerMeetingPorts,
  type AbsenceFinesPort,
  type AgendaMoneyData,
  type MeetingMoneyPort,
} from './meetings.ports';
export { meetingRoutes, meetingsGroupRoutes } from './meetings.routes';
