//! The book of what phones ask of this PC: one entry per group of requests, with the user's answer.
//!
//! A phone sends one request per app. The requests of one tap share a `batch`, so the user is asked
//! once, sees one progress window and gets one result. Nothing here talks to a phone; time is
//! passed in, so every rule can be tested.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;

/// How long the user has to answer.
pub const ASK_WAIT: Duration = Duration::from_secs(120);
/// A phone that sends no next request of a group for this long has given up.
pub const NEXT_WAIT: Duration = Duration::from_secs(20);
/// A phone that is not seen for this long while it waits for an answer is gone.
const GONE_WAIT: Duration = Duration::from_secs(10);
/// Ended groups are remembered this long, so that a late request of one is not asked again.
const KEEP_ENDED: Duration = Duration::from_secs(600);

/// Why a request or a group of them ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum EndReason {
    /// Every request of the group was carried out, well or not.
    Finished,
    /// Cancelled on the phone.
    Phone,
    /// Cancelled on this PC.
    Pc,
    Rejected,
    /// Nobody answered in time.
    Expired,
    /// The phone took its request back or sent no more of the group.
    Gone,
    Disconnected,
    /// The request could not be read or is not allowed.
    Invalid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Answer {
    Open,
    Accepted,
    Rejected,
    Expired,
}

/// What to do with a request now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// Tell the phone to wait because another job runs on it.
    Busy,
    /// Ask the user and tell the phone to wait.
    Ask,
    Wait,
    Run,
    Reject(EndReason),
}

#[derive(Debug)]
pub struct Batch {
    pub phone: String,
    pub id: String,
    answer: Answer,
    /// Set while the question is on the screen.
    asked: Option<Instant>,
    told_busy: bool,
    /// The request that waits or runs.
    pub current: String,
    waiting: bool,
    /// The last time anything happened to the group.
    last: Instant,
    ended: Option<Instant>,
}

impl Batch {
    pub fn is_open(&self) -> bool {
        self.ended.is_none() && self.waiting
    }

    /// Seconds left to answer, while the user is being asked.
    pub fn left(&self, now: Instant) -> Option<u32> {
        let asked = self.asked.filter(|_| self.answer == Answer::Open)?;
        Some(ASK_WAIT.saturating_sub(now.duration_since(asked)).as_secs() as u32)
    }
}

#[derive(Default)]
pub struct Book {
    batches: HashMap<(String, String), Batch>,
    /// When each phone was last seen.
    seen: HashMap<String, Instant>,
}

fn key(phone: &str, batch: &str) -> (String, String) {
    (phone.to_string(), batch.to_string())
}

impl Book {
    pub fn get(&self, phone: &str, batch: &str) -> Option<&Batch> {
        self.batches.get(&key(phone, batch))
    }

    /// True when a request was already accepted into the book, so its age does not matter anymore.
    pub fn knows(&self, phone: &str, batch: &str, request: &str) -> bool {
        self.get(phone, batch)
            .is_some_and(|b| b.waiting && b.current == request)
    }

    /// One request was found on a phone. `allowed` means that nobody has to be asked.
    pub fn found(
        &mut self,
        phone: &str,
        batch: &str,
        request: &str,
        allowed: bool,
        busy: bool,
        now: Instant,
    ) -> Step {
        let entry = self
            .batches
            .entry(key(phone, batch))
            .or_insert_with(|| Batch {
                phone: phone.into(),
                id: batch.into(),
                answer: Answer::Open,
                asked: None,
                told_busy: false,
                current: request.into(),
                waiting: true,
                last: now,
                ended: None,
            });
        match entry.answer {
            Answer::Rejected => return Step::Reject(EndReason::Rejected),
            Answer::Expired => return Step::Reject(EndReason::Expired),
            _ => {}
        }
        if entry.ended.is_some() {
            return Step::Reject(EndReason::Gone);
        }
        entry.current = request.into();
        entry.waiting = true;
        entry.last = now;
        if busy {
            // The question is not on the screen while the job before it runs.
            entry.asked = None;
            return if std::mem::replace(&mut entry.told_busy, true) {
                Step::Wait
            } else {
                Step::Busy
            };
        }
        entry.told_busy = false;
        if entry.answer == Answer::Accepted || allowed {
            entry.answer = Answer::Accepted;
            entry.asked = None;
            entry.waiting = false;
            return Step::Run;
        }
        match entry.asked {
            None => {
                entry.asked = Some(now);
                Step::Ask
            }
            Some(at) if now.duration_since(at) >= ASK_WAIT => {
                entry.answer = Answer::Expired;
                entry.waiting = false;
                entry.ended = Some(now);
                Step::Reject(EndReason::Expired)
            }
            Some(_) => Step::Wait,
        }
    }

    /// The user's answer. False when the question is not open anymore.
    pub fn answer(&mut self, phone: &str, batch: &str, accept: bool, now: Instant) -> bool {
        match self.batches.get_mut(&key(phone, batch)) {
            Some(b) if b.is_open() && b.answer == Answer::Open && b.asked.is_some() => {
                b.last = now;
                b.answer = if accept {
                    Answer::Accepted
                } else {
                    b.ended = Some(now);
                    Answer::Rejected
                };
                true
            }
            _ => false,
        }
    }

    /// The request of a running job ended and the next one may come.
    pub fn touched(&mut self, phone: &str, batch: &str, now: Instant) {
        if let Some(b) = self.batches.get_mut(&key(phone, batch)) {
            b.last = now;
        }
    }

    pub fn end(&mut self, phone: &str, batch: &str, now: Instant) {
        if let Some(b) = self.batches.get_mut(&key(phone, batch)) {
            b.ended = Some(now);
            b.waiting = false;
        }
    }

    /// A visit to a phone: what it asks for now and what it cancels. Returns the groups that ended.
    pub fn visited(
        &mut self,
        phone: &str,
        request: Option<&str>,
        cancel: Option<&str>,
        now: Instant,
    ) -> Vec<(String, EndReason)> {
        self.seen.insert(phone.to_string(), now);
        let mut ended = Vec::new();
        for b in self.batches.values_mut() {
            if b.phone != phone || !b.is_open() {
                continue;
            }
            let reason = if cancel == Some(b.current.as_str()) {
                EndReason::Phone
            } else if b.answer == Answer::Open && request != Some(b.current.as_str()) {
                EndReason::Gone
            } else {
                continue;
            };
            b.ended = Some(now);
            b.waiting = false;
            ended.push((b.id.clone(), reason));
        }
        ended
    }

    /// Ends the groups whose phone went away or sent nothing more. `running` tells whether a job of
    /// the phone runs. Returns the phone, the group and the reason of each.
    pub fn sweep(
        &mut self,
        running: &dyn Fn(&str) -> bool,
        now: Instant,
    ) -> Vec<(String, String, EndReason)> {
        let mut ended = Vec::new();
        for b in self.batches.values_mut() {
            if b.ended.is_some() || running(&b.phone) {
                continue;
            }
            let gone = self
                .seen
                .get(&b.phone)
                .is_none_or(|at| now.duration_since(*at) > GONE_WAIT);
            let reason = if b.waiting && b.answer == Answer::Open {
                if !gone {
                    continue;
                }
                EndReason::Disconnected
            } else if now.duration_since(b.last) > NEXT_WAIT {
                if gone {
                    EndReason::Disconnected
                } else {
                    EndReason::Gone
                }
            } else {
                continue;
            };
            b.ended = Some(now);
            b.waiting = false;
            ended.push((b.phone.clone(), b.id.clone(), reason));
        }
        self.batches
            .retain(|_, b| b.ended.is_none_or(|at| now.duration_since(at) < KEEP_ENDED));
        ended
    }

    /// True while anything waits for an answer or for a next request.
    pub fn is_active(&self) -> bool {
        self.batches.values().any(|b| b.ended.is_none())
    }

    /// The groups the user is being asked about, with the seconds that are left.
    pub fn asking(&self, now: Instant) -> Vec<(&Batch, u32)> {
        self.batches
            .values()
            .filter(|b| b.is_open())
            .filter_map(|b| b.left(now).map(|left| (b, left)))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(start: Instant, secs: u64) -> Instant {
        start + Duration::from_secs(secs)
    }

    #[test]
    fn a_group_is_asked_once() {
        let t = Instant::now();
        let mut book = Book::default();
        assert_eq!(book.found("P", "b", "r1", false, false, t), Step::Ask);
        assert_eq!(
            book.found("P", "b", "r1", false, false, at(t, 1)),
            Step::Wait
        );
        assert!(book.answer("P", "b", true, at(t, 2)));
        assert_eq!(
            book.found("P", "b", "r1", false, false, at(t, 3)),
            Step::Run
        );
        book.touched("P", "b", at(t, 4));
        assert_eq!(
            book.found("P", "b", "r2", false, false, at(t, 5)),
            Step::Run
        );
        // Another group is another question.
        assert_eq!(
            book.found("P", "c", "r3", false, false, at(t, 6)),
            Step::Ask
        );
    }

    #[test]
    fn a_rejection_covers_the_rest_of_the_group() {
        let t = Instant::now();
        let mut book = Book::default();
        book.found("P", "b", "r1", false, false, t);
        assert!(book.answer("P", "b", false, t));
        let no = Step::Reject(EndReason::Rejected);
        assert_eq!(book.found("P", "b", "r1", false, false, at(t, 1)), no);
        assert_eq!(book.found("P", "b", "r2", true, false, at(t, 2)), no);
        assert!(!book.answer("P", "b", true, at(t, 3)));
    }

    #[test]
    fn an_unanswered_question_expires() {
        let t = Instant::now();
        let mut book = Book::default();
        book.found("P", "b", "r1", false, false, t);
        assert_eq!(book.asking(at(t, 20))[0].1, 100);
        assert_eq!(
            book.found("P", "b", "r1", false, false, at(t, 119)),
            Step::Wait
        );
        let gone = Step::Reject(EndReason::Expired);
        assert_eq!(book.found("P", "b", "r1", false, false, at(t, 120)), gone);
        assert!(!book.answer("P", "b", true, at(t, 121)));
        assert_eq!(book.found("P", "b", "r2", false, false, at(t, 122)), gone);
    }

    #[test]
    fn a_trusted_phone_runs_without_a_question() {
        let t = Instant::now();
        let mut book = Book::default();
        assert_eq!(book.found("P", "b", "r1", true, false, t), Step::Run);
        assert!(book.asking(t).is_empty());
    }

    #[test]
    fn a_busy_phone_waits_its_turn_and_is_asked_after() {
        let t = Instant::now();
        let mut book = Book::default();
        assert_eq!(book.found("P", "b", "r1", false, true, t), Step::Busy);
        assert_eq!(
            book.found("P", "b", "r1", false, true, at(t, 500)),
            Step::Wait
        );
        // The time in the queue does not count as time to answer.
        assert_eq!(
            book.found("P", "b", "r1", false, false, at(t, 501)),
            Step::Ask
        );
        assert_eq!(
            book.found("P", "b", "r1", false, false, at(t, 600)),
            Step::Wait
        );
        assert!(book.knows("P", "b", "r1") && !book.knows("P", "b", "r2"));
    }

    #[test]
    fn a_phone_that_takes_its_request_back_closes_the_question() {
        let t = Instant::now();
        let mut book = Book::default();
        book.found("P", "b", "r1", false, false, t);
        book.found("Q", "b", "r1", false, false, t);
        assert!(book.visited("P", Some("r1"), None, t).is_empty());
        assert_eq!(
            book.visited("P", Some("r1"), Some("r1"), t),
            [("b".to_string(), EndReason::Phone)]
        );
        assert_eq!(
            book.visited("Q", None, None, t),
            [("b".to_string(), EndReason::Gone)]
        );
        assert!(!book.answer("P", "b", true, t));
        assert!(book.visited("P", None, Some("r1"), t).is_empty());
    }

    #[test]
    fn an_old_cancel_does_not_touch_a_new_request() {
        let t = Instant::now();
        let mut book = Book::default();
        book.found("P", "b", "r2", false, false, t);
        assert!(book.visited("P", Some("r2"), Some("r1"), t).is_empty());
    }

    #[test]
    fn a_phone_that_goes_away_closes_the_question() {
        let t = Instant::now();
        let mut book = Book::default();
        book.visited("P", None, None, t);
        book.found("P", "b", "r1", false, false, t);
        let idle = |_: &str| false;
        assert!(book.sweep(&idle, at(t, 9)).is_empty());
        assert_eq!(
            book.sweep(&idle, at(t, 11)),
            [("P".to_string(), "b".to_string(), EndReason::Disconnected)]
        );
    }

    #[test]
    fn a_group_that_stops_half_way_ends() {
        let t = Instant::now();
        let mut book = Book::default();
        book.found("P", "b", "r1", true, false, t);
        // A long job is not a silent phone.
        assert!(book.sweep(&|_| true, at(t, 900)).is_empty());
        book.touched("P", "b", at(t, 900));
        book.visited("P", None, None, at(t, 919));
        assert!(book.sweep(&|_| false, at(t, 919)).is_empty());
        book.visited("P", None, None, at(t, 921));
        assert_eq!(
            book.sweep(&|_| false, at(t, 921)),
            [("P".to_string(), "b".to_string(), EndReason::Gone)]
        );
        assert!(!book.is_active());
    }
}
