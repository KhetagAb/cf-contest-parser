const CONTEST_TITLE = 3;
const FIRST_CONTEST_ROW = 5;
const FIRST_CONTEST_COLUMN = "H";

const TABLE_NAME = "Группа - 5 - export";

const Status = { BONUS: 2, SOLVED: 1, RESOLVED: 0.99, REJECT: "-", WAITING: "?" };

const SUBMISSION_ID_RANGE = "SubmissionsId";
const CONTEST_ID_RANGE = "ContestsId";
const CONTEST_ID_REVIEW_RANGE = "ContestsIdReview";
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
    .map(e => { return {contest: new Contest(e), review: false}});
  var contestsWithReview = getValuesByRangeName(spreadsheet, CONTEST_ID_REVIEW_RANGE)
    .map(e => { return {contest: new Contest(e), review: true}});
  var contests = contestsWithReview.concat(contestsWithoutReview)
    .sort((a, b) => a.contest.startTimeSeconds - b.contest.startTimeSeconds).reverse();

  var pointerFrom = FIRST_CONTEST_COLUMN.charCodeAt(0) - "A".charCodeAt(0) + 1;
  for (var i = 0; i < contests.length; i++) {
    pointerFrom = displayContest(spreadsheet.getSheetByName(TABLE_NAME), contests[i], handles, pointerFrom);
  }
  
  var lastWeek = getTable(contests[0], handles).map(e => [e.reduce((a, b) => a + (typeof b == 'number' ? b : 0), 0)]);
  SpreadsheetApp.getActive().getRangeByName(LAST_WEEK_RANGE).setValues(lastWeek);
}

function displayContest(sheet, contestEntity, handles, pointerFrom) {
  var problemsIndex = contestEntity.contest.problems.map(e => e.index);

  sheet.getRange(CONTEST_TITLE, pointerFrom, 1, problemsIndex.length).setValues([problemsIndex]);
  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, 1, problemsIndex.length).breakApart().merge().setValue(contestEntity.contest.name);

  var table = getTable(contestEntity, handles);

  sheet.getRange(FIRST_CONTEST_ROW, pointerFrom, handles.length, problemsIndex.length)
    .setValues(table);
  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, handles.length + 3, problemsIndex.length)
    .setBorder(null, null, null, true, false, false, "black", SpreadsheetApp.BorderStyle.DOUBLE);
  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, 2, problemsIndex.length)
    .setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.DOUBLE);

  return pointerFrom + problemsIndex.length;
}

function getTable(contestEntity, handles) {
  var review = contestEntity.review;
  var contest = contestEntity.contest;
  var problems = contest.problems;
  var contestRows = contest.contestRows;

  var table = [];
  for (var i = 0; i < handles.length; i++) {
    var contestRow = contestRows.find(e => e.handle === handles[i]);
    if (contestRow === undefined) {
      table.push(new Array(problems.length).fill("0"));
    } else {
      table.push(contestRow.getSubmissions(review));
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
    this.contest = contest;
    this.build();
  }

  build() {
    this.cells = {}
    
    var problems = this.contest.problems;
    for (var i = 0; i < problems.length; i++) {
      this.cells[problems[i].index] = {status: null, submissionId: null};
    }

    // toDo => sort?
    var submissions = this.contest.submissions.filter(e => e.author.members[0].handle == this.handle)
    for (var j = 0; j < submissions.length; j++) {
      var submission = submissions[j];

      if (this.contest.contestId != submission.problem.contestId) {
        throw new Error("Try to add problem " + submission.problem + " from contest " + submission.problem.contestId + " to contest " + this.contest.id);
      }

      var submissionId = this.cells[submission.problem.index].submissionId;
      var status = this.cells[submission.problem.index].status;
      var newStatus = this.contest.getProblemStatus(submission);

      if (newStatus == Status.REJECT) {
        status = newStatus;
        submissionId = submission.id;
      } else if (newStatus != null && status != Status.SOLVED) {
        status = newStatus;
        submissionId = submission.id;
      }

      this.cells[submission.problem.index] = {status: status, submissionId: submissionId};
    }
  }

  getSubmissions(review) {
    var problems = Object.values(this.cells);

    var result = problems.map(function(e) {
      if (review && e.status == Status.SOLVED && !reviewedSubmissionIds.includes(e.submissionId)) {
        return Status.WAITING;
      } else {
        return e.status;
      }
    });

    return result;
  }
}

class Contest {
  constructor (contestId) {
    this.contestId = contestId;
    this.build();
  }

  build() {
    var contestData = getContestStandings(this.contestId);

    this.submissions = getContestSubmissions(this.contestId);
    this.name = contestData.result.contest.name;
    this.durationSeconds = contestData.result.contest.durationSeconds;
    this.startTimeSeconds = contestData.result.contest.startTimeSeconds;
    this.problems = contestData.result.problems.map(e => new Problem(this.contestId, e.index, e.name));
    this.handles = [];
    contestData.result.rows.forEach((e) => this.handles.push(e.party.members[0].handle));
    
    this.contestRows = [];
    for (var i = 0; i < this.handles.length; i++) {
      var handle = this.handles[i];

      this.contestRows.push(new ContestRow(this, handle));
    }
  }

  getProblemStatus(submission) {
    if (submission.verdict == "SKIPPED" || submission.verdict == "REJECTED") {
      return Status.REJECT;
    }

    var status;
    if (submission.verdict == "OK") {
      if (submission.relativeTimeSeconds <= this.durationSeconds) {
        status = Status.SOLVED;
      } else {
        status = Status.RESOLVED;
      }
    } else {
      status = null;
    }

    return status;
  }
}

function getContestSubmissions(contestId) {
  var method = "contest.status";
  var params = [["contestId", contestId], ["from", 1]];

  return getContestData(method, params).result.reverse();
}

function getContestStandings(contestId) {
  var method = "contest.standings";
  var params = [["contestId", contestId], ["showUnofficial", "true"]];

  return getContestData(method, params);
}

function getContestData(method, params) {
  try {
    var HTTPResponse = authorizedRequest(method, params);
    var response = JSON.parse(HTTPResponse.getContentText());

    if (response.status != "OK") {
      throw new Error("Status of getting " + contestId + " contest isn't OK: " + response.status);
    }
  } catch (e) {
      throw new Error("Cannot send request method [" + method + "]: " + e);
  }

  return response;
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
  params.push(["apiKey", key]);
  params.push(["time", time]);

  var rand = randFromTo(100000, 999999);
  var apiSig = rand + sha512(rand + "/" + method_name + "?" + convertToAuthUriParms(params) + "#" + secret);
  params.push(["apiSig", apiSig]);

  authParams = convertToAuthUriParms(params);

  var request = "https://codeforces.com/api/" + method_name + "?" + authParams;

  // Logger.log(request);

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
