export function filterQuestionsBySearch(questions, searchQuery, searchFilter = 'all') {
  if (!searchQuery || !searchQuery.trim()) return questions;

  const query = searchQuery.toLowerCase().trim();

  return questions.filter((question) => {
    const text = (question.text || '').toLowerCase();
    const title = (question.title || '').toLowerCase();
    const keywords = (question.keywords || '').toLowerCase();
    const tags = (question.tags || '').toLowerCase();
    const course = (question.course || '').toLowerCase();
    const school = (question.school || '').toLowerCase();
    const questionType = (question.question_type || '').toLowerCase();
    const bloomsTaxonomy = (question.blooms_taxonomy || '').toLowerCase();

    switch (searchFilter) {
      case 'keywords':
        return keywords.includes(query);
      case 'tags':
        return tags.includes(query);
      case 'course':
        return course.includes(query) || school.includes(query);
      case 'text':
        return text.includes(query) || title.includes(query);
      case 'all':
      default:
        return (
          text.includes(query) ||
          title.includes(query) ||
          keywords.includes(query) ||
          tags.includes(query) ||
          course.includes(query) ||
          school.includes(query) ||
          questionType.includes(query) ||
          bloomsTaxonomy.includes(query)
        );
    }
  });
}
