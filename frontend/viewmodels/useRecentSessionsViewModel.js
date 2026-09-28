'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  clearAllRecentSessions,
  deleteRecentSession,
  getRecentSessions,
  saveRecentSession,
} from '../lib/models/sessionRepository';

export function useRecentSessionsViewModel() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);

  useEffect(() => {
    setSessions(getRecentSessions());
  }, []);

  const saveSession = useCallback((entry) => {
    setSessions(saveRecentSession(entry));
    setActiveSessionId(entry.id);
  }, []);

  const deleteSession = useCallback((sessionId) => {
    setSessions(deleteRecentSession(sessionId));
    setActiveSessionId((current) => (current === sessionId ? null : current));
  }, []);

  const clearSessions = useCallback(() => {
    setSessions(clearAllRecentSessions());
    setActiveSessionId(null);
  }, []);

  return { sessions, activeSessionId, setActiveSessionId, saveSession, deleteSession, clearSessions };
}
