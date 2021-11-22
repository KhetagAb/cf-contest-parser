const CONTEST_TITLE = 3;
const FIRST_CONTEST_ROW = 5;
const FIRST_CONTEST_COLUMN = "H";

const TABLE_NAME = "Группа - 5 - export";

const Verdict = { SOLVED: 1, RESOLVED: 1, TRIED: 0, REJECT: "-", WAITING: "?", EXAM: 1.01 };

const SUBMISSION_ID_RANGE = "SubmissionsId";
const CONTEST_ID_RANGE = "ContestsId";
const CONTEST_ID_REVIEW_RANGE = "ContestsIdReview";
const CONTEST_ID_EXAM = "ContestsIdExam";
const HANDLES_RANGE = "Handles";
const LAST_WEEK_RANGE = "LastWeek"

const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
const reviewedSubmissionIds = getValuesByRangeName(spreadsheet, SUBMISSION_ID_RANGE);

function getAllResults() {
  if (spreadsheet == null) {
    throw new Error("Cannot find spreadsheet.")
  }

  var handles = getValuesByRangeName(spreadsheet, HANDLES_RANGE);
  var contestsWithoutReview = getValuesByRangeName(spreadsheet, CONTEST_ID_RANGE)
    .map(e => { return {contest: new Contest(e), review: false, exam: false}});
  var contestsWithReview = getValuesByRangeName(spreadsheet, CONTEST_ID_REVIEW_RANGE)
    .map(e => { return {contest: new Contest(e), review: true, exam: false}});
  var contestsExam = getValuesByRangeName(spreadsheet, CONTEST_ID_EXAM)
    .map(e => { return {contest: new Contest(e), review: false, exam: true}});

  var contests = contestsExam.concat(contestsWithReview).concat(contestsWithoutReview)
    .sort((a, b) => a.contest.startTimeSeconds - b.contest.startTimeSeconds).reverse();

  var lastWeek = getExamTable(contests, 0, handles).map(e => [e.reduce((a, b) => a + (typeof b == "number" ? b : 0), 0)]);
  lastWeek.push([Utilities.formatDate(new Date(), "GMT+3", "HH:mm")])
  SpreadsheetApp.getActive().getRangeByName(LAST_WEEK_RANGE).setValues(lastWeek);

  var pointerFrom = FIRST_CONTEST_COLUMN.charCodeAt(0) - "A".charCodeAt(0) + 1;
  for (var i = 0; i < contests.length; i++) {
    pointerFrom = displayContest(spreadsheet.getSheetByName(TABLE_NAME), contests, i, handles, pointerFrom);
  }
}

function displayContest(sheet, contests, contestIndex, handles, pointerFrom) {
  var contestEntity = contests[contestIndex];
  var problemsIndex = contestEntity.contest.problems.map(e => e.index);

  sheet.getRange(CONTEST_TITLE, pointerFrom, 1, problemsIndex.length).setValues([problemsIndex]);
  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, 1, problemsIndex.length).breakApart().merge().setValue(contestEntity.contest.name);

  if (contestEntity.exam) {
    table = getExamTable(contests, contestIndex, handles);
  } else {
    table = getTable(contestEntity, handles);
  }

  sheet.getRange(FIRST_CONTEST_ROW, pointerFrom, handles.length, problemsIndex.length)
    .setValues(table);
  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, handles.length + 3, problemsIndex.length)
    .setBorder(null, null, null, true, false, false, "black", SpreadsheetApp.BorderStyle.DOUBLE);
  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, 2, problemsIndex.length)
    .setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.DOUBLE);

  return pointerFrom + problemsIndex.length;
}

function getExamTable(contests, contestIndex, handles) {
  var contest = contests[contestIndex].contest;
  var problems = contest.problems;

  var table = new Array(handles.length);
  for (var i = 0; i < handles.length; i++) {
    table[i] = new Array(0);
  }

  for (var j = 0; j < problems.length; j++) {
    var problem = problems[j];
    var examContestColumn = contest.getProblemColumn(handles, problem);

    var foundContest = contests.find(function(contestEntity) {
      var currentContest = contestEntity.contest;
      return currentContest.contestId !== contest.contestId &&
            currentContest.problems.findIndex(p => p.name === problem.name) !== -1
    });

    var contestColumn = new Array(handles.length).fill(null);
    if (foundContest !== undefined) {
      contestColumn = foundContest.contest.getProblemColumn(handles, problem);
    }

    for (var i = 0; i < handles.length; i++) {
      var lastSubmission = contestColumn[i];
      var currentSubmission = examContestColumn[i];
      var submission = lastSubmission;

      if (lastSubmission == null || (lastSubmission.verdict != Verdict.SOLVED && lastSubmission.verdict != Verdict.REJECT)) {
        if (currentSubmission != null && (currentSubmission.verdict == Verdict.SOLVED || currentSubmission.verdict == Verdict.EXAM)) {
          submission = currentSubmission;
          submission.verdict = Verdict.EXAM;
        }
      }

      if (submission == null) {
        table[i].push(null);
      } else  {
        table[i].push(submission.getVerdict(false));
      }
    }
  }
  return table
}

function getTable(contestEntity, handles) {
  var review = contestEntity.review;
  var contest = contestEntity.contest;
  var problems = contest.problems;
  var contestRows = contest.contestRows;

  var table = [];
  for (var i = 0; i < handles.length; i++) {
    var contestRow = contestRows.find(e => e.handle === handles[i]);
    if (contestRow == undefined) {
      table.push(new Array(problems.length).fill(null));
    } else {
      table.push(contestRow.getVerdicts(review));
    }
  }

  return table
}

class Problem {
  constructor (contestId, index, name) {
    this.contestId = contestId;
    this.index = index;
    this.name = name;
  }
}

class ContestRow {
  constructor (contest, handle) {
    this.handle = handle;
    this.build(contest);
  }

  build(contest) {
    this.submissionsMap = {}
    contest.problems.forEach(p => this.submissionsMap[p.index] = null);

    var handleSubmissions = contest.submissions.filter(s => s.handle == this.handle);
    for (var j = 0; j < handleSubmissions.length; j++) {
      var submission = handleSubmissions[j];
      var problemIndex = submission.problem.index;

      this.submissionsMap[problemIndex] = chooseSubmission(this.submissionsMap[problemIndex], submission);
    }
  }

  getVerdicts(review) {
    var submissions = Object.values(this.submissionsMap);
    var verdicts = submissions.map(function(s) {
      if (s == null) {
        return null
      } else {
        return s.getVerdict(review);
      }
    });

    return verdicts;
  }
}

function chooseSubmission(currentSubmission, lastSubmission) {
  if (lastSubmission == null) {
    return currentSubmission;
  } else if (currentSubmission == null || currentSubmission.verdict != Verdict.SOLVED || 
            currentSubmission.verdict != Verdict.REJECT) {
    return lastSubmission;
  }
}

class Submission {
  constructor (submissionData, contest, problem) {
    this.id = submissionData.id;
    this.handle = submissionData.author.members[0].handle;

    this.problem = problem;
    
    var verdict;
    if (submissionData.verdict == "SKIPPED" || submissionData.verdict == "REJECTED") {
      verdict = Verdict.REJECT;
    } else if (submissionData.verdict == "OK") {
      if (submissionData.relativeTimeSeconds <= contest.durationSeconds) {
        verdict = Verdict.SOLVED;
      } else {
        verdict = Verdict.RESOLVED;
      }
    } else {
      verdict = Verdict.TRIED;
    }

    this.verdict = verdict;
  }

  getVerdict(review) {
    if (review && this.verdict == Verdict.SOLVED && !reviewedSubmissionIds.includes(this.id)) {
      return Verdict.WAITING;
    } else {
      return this.verdict;
    }
  }
}

class Contest {
  constructor (contestId) {
    this.contestId = contestId;
    this.build();
  }

  build() {
    var contestData = getContestStandingsData(this.contestId);

    this.name = contestData.result.contest.name;
    this.durationSeconds = contestData.result.contest.durationSeconds;
    this.startTimeSeconds = contestData.result.contest.startTimeSeconds;
    this.problems = contestData.result.problems.map(e => new Problem(this.contestId, e.index, e.name));

    var submissions = getContestSubmissionsData(this.contestId);
    this.submissions = submissions.map(s => new Submission(s, this, this.problems.find(p => p.index === s.problem.index)));

    this.handles = [];
    contestData.result.rows.forEach((e) => this.handles.push(e.party.members[0].handle));
    
    this.contestRows = [];
    this.handles.forEach(h => this.contestRows.push(new ContestRow(this, h)));
  }

  getProblemColumn(handles, problem) {
    if (this.problems.findIndex(e => e.name === problem.name) === -1) {
      throw new Error("Cannot find problem name: " + problem.name + " in contest with id " + this.contestId);
    }

    var column = []
    for (var i = 0; i < handles.length; i++) {
      var handle = handles[i];
      var handleRow = this.contestRows.find(e => e.handle == handle);
      
      if (handleRow == undefined) {
        column.push(null);
      } else {
        var submissions = Object.values(handleRow.submissionsMap);
        column.push(submissions.find(s => s != null && s.problem.name == problem.name));
      }
    }

    return column;
  }
}

function getContestSubmissionsData(contestId) {
  var method = "contest.status";
  var params = [["contestId", contestId], ["from", 1]];

  return getContestData(method, params).result.reverse();
}

function getContestStandingsData(contestId) {
  var method = "contest.standings";
  var params = [["contestId", contestId], ["showUnofficial", "true"]];

  return getContestData(method, params);
}

function getContestData(method, params) {
  var HTTPResponse;
  try {
    HTTPResponse = authorizedRequest(method, params);    
  } catch (e) {
    throw new Error("Cannot send request method [" + method + "]: " + e);
  }

  if (HTTPResponse.getResponseCode() === 200) {
    var response;
    try {
      response = JSON.parse(HTTPResponse.getContentText());
    } catch (e) {
      throw new Error("Cannot parse to JSON: " + HTTPResponse.getContentText());
    }

    if (response.status !== "OK") {
      throw new Error("Invalid response: codeforces status returned: " + response.status);
    }

    return response;
  } else {
    if (HTTPResponse.getResponseCode() === 503) {
      Logger.log("Request failed with code 503, retrying...")
      return getContestData(method, params);
    }

    throw new Error("Http request failed with code: " + HTTPResponse.getResponseCode() + ": " + HTTPResponse.getContentText());
  }
}

function getValuesByRangeName(spreadsheet, rangeName) {
  var range, values;
  try {
    range = spreadsheet.getRangeByName(rangeName);
    values = range.getValues();
  } catch (err) {
    throw new Error("Cannot find or access to named range " + rangeName + ": " + err);
  }
  return values.reduce((head, tail) => head.concat(tail)).filter(Boolean);
}

function authorizedRequest(method_name, params) {
  var key = "xxx";
  var secret = "yyy";

  var time = Math.floor(Date.now() / 1000);
  var param = [...params];
  param.push(["apiKey", key]);
  param.push(["time", time]);

  var rand = randFromTo(100000, 999999);
  var apiSig = rand + sha512(rand + "/" + method_name + "?" + convertToAuthUriParms(param) + "#" + secret);
  param.push(["apiSig", apiSig]);

  authParams = convertToAuthUriParms(param);

  var request = "https://codeforces.com/api/" + method_name + "?" + authParams;

  return UrlFetchApp.fetch(request, {muteHttpExceptions: true });
}

function randFromTo(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function convertToAuthUriParms(params) {
  return params.sort().map(e => encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1])).join('&');
}

function sha512(str) {
  var signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_512, str);

  return signature
      .map(function(byte) {
          var v = (byte < 0) ? 256 + byte : byte;
          return ("0" + v.toString(16)).slice(-2);
      })
      .join("");
}
