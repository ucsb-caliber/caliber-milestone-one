import { getQuestionsBatch } from '../api';

export function getAssignmentQuestionRefs(assignment) {
  return Array.isArray(assignment?.assignment_question_refs)
    ? assignment.assignment_question_refs.filter(ref => ref && typeof ref === 'object')
    : [];
}

export function getAssignmentQuestionIds(assignment) {
  const refs = getAssignmentQuestionRefs(assignment);
  const idsFromRefs = refs
    .map(ref => Number(ref.id))
    .filter(id => Number.isInteger(id) && id > 0);

  if (idsFromRefs.length > 0) return idsFromRefs;

  return Array.isArray(assignment?.assignment_questions)
    ? assignment.assignment_questions
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0)
    : [];
}

export function getAssignmentQuestionCount(assignment) {
  const refs = getAssignmentQuestionRefs(assignment);
  if (refs.length > 0) return refs.length;
  return getAssignmentQuestionIds(assignment).length;
}

function questionFromSnapshot(ref, fallbackPosition) {
  const snapshot = ref?.question_snapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;

  const id = Number(ref.id);
  const syntheticId = Number.isInteger(id) && id > 0
    ? id
    : `snapshot-${ref.qid || snapshot.qid || fallbackPosition}`;

  return {
    id: syntheticId,
    qid: snapshot.qid || ref.qid || String(syntheticId),
    version: snapshot.version || ref.version || 1,
    title: snapshot.title || 'Untitled',
    text: snapshot.text || snapshot.content?.stem || '',
    content: snapshot.content || null,
    question_type: snapshot.question_type || snapshot.content?.parts?.[0]?.type || '',
    answer_choices: snapshot.answer_choices || '[]',
    correct_answer: snapshot.correct_answer || '',
    image_url: snapshot.image_url || '',
    user_id: snapshot.user_id || 'assignment-snapshot',
    visibility: snapshot.visibility || 'snapshot',
    is_assignment_snapshot: true,
  };
}

export async function loadAssignmentQuestions(assignment) {
  const refs = getAssignmentQuestionRefs(assignment);
  const ids = getAssignmentQuestionIds(assignment);

  if (ids.length === 0 && refs.length === 0) return [];

  const result = ids.length > 0 ? await getQuestionsBatch(ids) : { questions: [] };
  const liveQuestions = Array.isArray(result?.questions) ? result.questions : [];
  const liveById = new Map(liveQuestions.map(question => [Number(question.id), question]));

  if (refs.length === 0) {
    return ids.map(id => liveById.get(Number(id))).filter(Boolean);
  }

  return refs
    .map((ref, index) => {
      const liveQuestion = liveById.get(Number(ref.id));
      if (liveQuestion) {
        return {
          ...liveQuestion,
          assigned_qid: ref.qid || liveQuestion.qid,
          assigned_version: ref.version || liveQuestion.version,
        };
      }
      return questionFromSnapshot(ref, index);
    })
    .filter(Boolean);
}

export function getQuestionStableKey(question) {
  return String(question?.id ?? question?.qid ?? question?.assigned_qid ?? '');
}
