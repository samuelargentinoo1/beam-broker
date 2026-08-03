-- Funil dividido entre IA (até marcar a visita) e CORRETOR (daí em diante).
-- Duas etapas novas: o corretor assumir o lead e o comparecimento à visita.
ALTER TYPE "StatusLead" ADD VALUE IF NOT EXISTS 'EM_ATENDIMENTO' AFTER 'VISITA_AGENDADA';
ALTER TYPE "StatusLead" ADD VALUE IF NOT EXISTS 'COMPARECIMENTO' AFTER 'EM_ATENDIMENTO';
