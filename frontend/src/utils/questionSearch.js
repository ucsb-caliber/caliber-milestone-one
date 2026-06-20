export function filterQuestionsBySearch(questions, searchQuery, searchFilter = 'all') {
  if (!searchQuery || !searchQuery.trim()) return questions;

  const query = searchQuery.toLowerCase().trim();

  const stringifyContent = (content) => {
    if (!content) return '';
    try {
      const parsed = typeof content === 'string' ? JSON.parse(content) : content;
      const pieces = [
        parsed?.stem,
        ...(Array.isArray(parsed?.parts) ? parsed.parts.flatMap(part => [
          part?.id,
          part?.title,
          part?.prompt,
          part?.type,
          part?.correct_answer,
          ...(Array.isArray(part?.choices) ? part.choices.map(choice => choice?.text) : []),
          ...(Array.isArray(part?.rubric) ? part.rubric.flatMap(level => [level?.label, level?.description]) : []),
        ]) : []),
      ];
      return pieces.filter(Boolean).join(' ').toLowerCase();
    } catch {
      return String(content || '').toLowerCase();
    }
  };

  return questions.filter((question) => {
    const qid = (question.qid || '').toLowerCase();
    const version = question.version ? `v${question.version}`.toLowerCase() : '';
    const text = (question.text || '').toLowerCase();
    const title = (question.title || '').toLowerCase();
    const keywords = (question.keywords || '').toLowerCase();
    const tags = (question.tags || '').toLowerCase();
    const course = (question.course || '').toLowerCase();
    const school = (question.school || '').toLowerCase();
    const visibility = (question.visibility || '').toLowerCase();
    const draftState = (question.draft_state || '').toLowerCase();
    const sourcePath = (question.source_path || '').toLowerCase();
    const questionType = (question.question_type || '').toLowerCase();
    const bloomsTaxonomy = (question.blooms_taxonomy || '').toLowerCase();
    const content = stringifyContent(question.content);

    switch (searchFilter) {
      case 'keywords':
        return keywords.includes(query);
      case 'tags':
        return tags.includes(query);
      case 'course':
        return course.includes(query) || school.includes(query);
      case 'text':
        return text.includes(query) || title.includes(query) || content.includes(query);
      case 'all':
      default:
        return (
          qid.includes(query) ||
          version.includes(query) ||
          text.includes(query) ||
          title.includes(query) ||
          content.includes(query) ||
          keywords.includes(query) ||
          tags.includes(query) ||
          course.includes(query) ||
          school.includes(query) ||
          visibility.includes(query) ||
          draftState.includes(query) ||
          sourcePath.includes(query) ||
          questionType.includes(query) ||
          bloomsTaxonomy.includes(query)
        );
    }
  });
}
