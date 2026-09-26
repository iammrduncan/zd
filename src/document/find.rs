use regex::{Regex, RegexBuilder};

use super::{Document, DocumentError, SourceRange};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FindDirection {
    Previous,
    Next,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FindQuery {
    pattern: String,
    regex: bool,
    case_sensitive: bool,
}

impl FindQuery {
    pub fn literal(pattern: impl Into<String>) -> Self {
        Self {
            pattern: pattern.into(),
            regex: false,
            case_sensitive: true,
        }
    }

    pub fn regex(pattern: impl Into<String>) -> Self {
        Self {
            pattern: pattern.into(),
            regex: true,
            case_sensitive: true,
        }
    }

    pub const fn case_sensitive(mut self, case_sensitive: bool) -> Self {
        self.case_sensitive = case_sensitive;
        self
    }

    fn compile(&self) -> Result<Regex, regex::Error> {
        let pattern = if self.regex {
            self.pattern.clone()
        } else {
            regex::escape(&self.pattern)
        };
        RegexBuilder::new(&pattern)
            .case_insensitive(!self.case_sensitive)
            .build()
    }
}

impl Document {
    pub fn matches(&self, query: &FindQuery) -> Result<Vec<SourceRange>, DocumentError> {
        if query.pattern.is_empty() && !query.regex {
            return Ok(Vec::new());
        }
        let expression = query.compile()?;
        Ok(expression
            .find_iter(&self.text())
            .map(|found| SourceRange::new(found.start(), found.end()))
            .collect())
    }

    pub fn find(
        &self,
        query: &FindQuery,
        from: usize,
        direction: FindDirection,
    ) -> Result<Option<SourceRange>, DocumentError> {
        self.validate_position(from)?;
        let matches = self.matches(query)?;
        let found = match direction {
            FindDirection::Next => matches
                .iter()
                .copied()
                .find(|range| range.start >= from)
                .or_else(|| matches.first().copied()),
            FindDirection::Previous => matches
                .iter()
                .rev()
                .copied()
                .find(|range| range.end <= from)
                .or_else(|| matches.last().copied()),
        };
        Ok(found)
    }

    pub fn replace_next(
        &mut self,
        query: &FindQuery,
        replacement: &str,
        from: usize,
        direction: FindDirection,
    ) -> Result<bool, DocumentError> {
        let Some(range) = self.find(query, from, direction)? else {
            return Ok(false);
        };
        let replacement = expanded_replacement(query, &self.text(), range, replacement)?;
        self.replace(range, &replacement)?;
        Ok(true)
    }

    pub fn replace_all(
        &mut self,
        query: &FindQuery,
        replacement: &str,
    ) -> Result<usize, DocumentError> {
        if query.pattern.is_empty() && !query.regex {
            return Ok(0);
        }
        let expression = query.compile()?;
        let source = self.text();
        let count = expression.find_iter(&source).count();
        if count == 0 {
            return Ok(0);
        }
        let replaced = if query.regex {
            expression.replace_all(&source, replacement).into_owned()
        } else {
            expression
                .replace_all(&source, regex::NoExpand(replacement))
                .into_owned()
        };
        self.replace(SourceRange::new(0, source.len()), &replaced)?;
        Ok(count)
    }
}

fn expanded_replacement(
    query: &FindQuery,
    source: &str,
    range: SourceRange,
    replacement: &str,
) -> Result<String, regex::Error> {
    if !query.regex {
        return Ok(replacement.to_string());
    }
    let expression = query.compile()?;
    let matched = &source[range.start..range.end];
    Ok(expression.replace(matched, replacement).into_owned())
}
