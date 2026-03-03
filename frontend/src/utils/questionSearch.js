export function getQuestionQID(question) {
  const suffix = question?.qid || `Q${question?.id}`;
  const qidSuffix = String(suffix || '');

  if (question?.title) {
    const slug = String(question.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (slug) {
      return `${slug}-${qidSuffix}`;
    }
  }

  return `question-${qidSuffix}`;
}

const buildCreatorSearchText = (question, userInfoCache = {}) => {
  const userInfo = userInfoCache?.[question?.user_id];
  const firstName = (userInfo?.first_name || '').trim();
  const lastName = (userInfo?.last_name || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const email = (userInfo?.email || '').trim();
  const providedInitials = (userInfo?.initials || '').trim();
  let derivedInitials = '';
  if (firstName && lastName) {
    derivedInitials = `${firstName[0]}${lastName[0]}`.toUpperCase();
  } else if (email) {
    const emailPrefix = email.split('@')[0] || '';
    derivedInitials = emailPrefix.slice(0, 2).toUpperCase();
  }
  const initials = [providedInitials, derivedInitials].filter(Boolean).join(' ');
  const userId = String(question?.user_id || userInfo?.user_id || '').trim();

  return `${fullName} ${email} ${initials} ${userId}`.toLowerCase().trim();
};

export function filterQuestionsBySearch(questions, searchQuery, searchFilter = 'all', options = {}) {
  if (!searchQuery || !searchQuery.trim()) return questions;

  const query = searchQuery.toLowerCase().trim();
  const userInfoCache = options?.userInfoCache || {};

  return questions.filter((question) => {
    const text = (question.text || '').toLowerCase();
    const title = (question.title || '').toLowerCase();
    const keywords = (question.keywords || '').toLowerCase();
    const tags = (question.tags || '').toLowerCase();
    const course = (question.course || '').toLowerCase();
    const courseType = (question.course_type || '').toLowerCase();
    const school = (question.school || '').toLowerCase();
    const questionType = (question.question_type || '').toLowerCase();
    const bloomsTaxonomy = (question.blooms_taxonomy || '').toLowerCase();
    const qid = getQuestionQID(question).toLowerCase();
    const creator = buildCreatorSearchText(question, userInfoCache);

    switch (searchFilter) {
      case 'creator':
        return creator.includes(query);
      case 'qid':
        return qid.includes(query);
      case 'title':
        return title.includes(query);
      case 'course_type':
        return courseType.includes(query);
      case 'blooms':
        return bloomsTaxonomy.includes(query);
      case 'question_type':
        return questionType.includes(query);
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
          creator.includes(query) ||
          qid.includes(query) ||
          text.includes(query) ||
          title.includes(query) ||
          keywords.includes(query) ||
          tags.includes(query) ||
          course.includes(query) ||
          courseType.includes(query) ||
          school.includes(query) ||
          questionType.includes(query) ||
          bloomsTaxonomy.includes(query)
        );
    }
  });
}
