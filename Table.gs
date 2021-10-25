const CONTEST_TITLE = 3;
const FIRST_CONTEST_COLUMN = "J";
const FIRST_CONTEST_ROW = 5;

const TABLE_NAME = "Результаты"

// NamedRanges
const CONTEST_LIST = "ContestsList";
const HANDLES = "Handles";

// Codeforces API Secrets
var key = "xxx";
var secret = "yyy";

function getAllResults() {
  var allContests = getValuesByRangeName(CONTEST_LIST);
  var handles = getValuesByRangeName(HANDLES);

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABLE_NAME);
  if (sheet == null) {
    throw new Error("Cannot find sheet: " + TABLE_NAME)
  }

  var pointerFrom = FIRST_CONTEST_COLUMN.charCodeAt(0) - "A".charCodeAt(0) + 1;
  for (var i = 0; i < allContests.length; i++) {
    pointerFrom = displayContest(sheet, new Contest(allContests[i]), handles, pointerFrom);
  }
}

function displayContest(sheet, contest, handles, pointerFrom) {
  var problems = contest.problems.map(e => e.index);

  sheet.getRange(CONTEST_TITLE, pointerFrom, 1, problems.length).setValues([problems]);

  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, 1, problems.length).merge().setValue(contest.name);

  var table = [];
  var contestRows = contest.contestRows;
  for (var i = 0; i < handles.length; i++) {
    var handle = handles[i];

    var handlerValues;
    if (contestRows[handle] == null) {
      handlerValues = new Array(problems.length).fill("0");
    } else {
      handlerValues = Object.values(contest.contestRows[handles[i]].getSubmissions());
    }

    table.push(handlerValues);
  }

  sheet.getRange(FIRST_CONTEST_ROW, pointerFrom, handles.length, problems.length).setValues(table);
  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, handles.length + 3, problems.length).setBorder(null, null, null, true, false, false, "black", SpreadsheetApp.BorderStyle.DOUBLE);
  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, 2, problems.length).setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.DOUBLE);

  return pointerFrom + problems.length;
}

function getValuesByRangeName(rangeName) {
  var range, values;
  try {
    range = SpreadsheetApp.getActive().getRangeByName(rangeName);
    values = range.getValues();
  } catch (err) {
    throw new Error("Cannot find or access to named range " + rangeName);
  }
  return values.reduce((head, tail) => head.concat(tail)).filter(Boolean);
}

class Problem {
  constructor (contestId, index, name) {
    this.contestId = contestId;
    this.index = index;
    this.name = name;
  }
}

class ContestRow {
  constructor (contestId) {
    this.contestId = contestId;

    this.problems = {}
  }

  addSubmission(problem, status) {
    if (this.contestId != problem.contestId) {
      throw new Error("Try to add problem " + problem + " from contest " + problem.contestId + " to contest " + this.contestId);
    }

    this.problems[problem.index] = getActualStatus(this.problems[problem.index], status);
  }

  getSubmissions() {
    return this.problems;
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

    this.problems = contestData.result.problems.map(e => new Problem(this.contestId, e.index, e.name));

    this.contestRows = {};
    for (var i = 0; i < contestData.result.rows.length; i++) {
      var row = contestData.result.rows[i];
      var handle = row.party.members[0].handle;

      for (var j = 0; j < row.problemResults.length; j++) {
        var problemData = row.problemResults[j];

        var status = getProblemStatus(problemData.points, problemData.bestSubmissionTimeSeconds, this.durationSeconds);

        if (this.contestRows[handle] == null) {
          this.contestRows[handle] = new ContestRow(this.contestId);
        }

        this.contestRows[handle].addSubmission(this.problems[j], status);
      }
    }
  }
}

function getContestStandingsData(contestId) {
  var method = "contest.standings";
  var params = [["contestId", contestId], ["showUnofficial", "true"]];

  try {
    var HTTPResponse = authorizedRequest(method, params);
    var standings = JSON.parse(HTTPResponse.getContentText());

    if (standings.status != "OK") {
      throw new Error("Status of getting " + contestId + " contest isn't OK: " + standings.status);
    }
  } catch (e) {
    Logger.log("Cannot get contest data: " + e);
    ContentService.createTextOutput("Cannot get contest data." + e);
    throw e;
  }

  return standings;
}

const Status = { SOLVED: 1, RESOLVED: 0.8, UNRESOLVED: "" };
function getProblemStatus(points, submissionTime, contestDuration) {
  var status;
  if (points == 1) {
    if (submissionTime <= contestDuration) {
      status = Status.SOLVED;
    } else {
      status = Status.RESOLVED;
    }
  } else {
    status = Status.UNRESOLVED;
  }

  return status;
}

function getActualStatus(lastStatus, newStatus) {
  if (lastStatus == null || lastStatus == Status.UNRESOLVED) {
    return newStatus;
  } else if (lastStatus == Status.SOLVED) {
    return lastStatus; 
  } else if (lastStatus == Status.RESOLVED) {
    if (newSub == Status.SOLVED) {
      return newStatus;
    } else {
      return lastStatus;
    }
  }
}

function authorizedRequest(method_name, params) {
  var time = Math.floor(Date.now() / 1000);
  params.push(["apiKey", key]);
  params.push(["time", time]);

  var rand = randFromTo(100000, 999999);
  var apiSig = rand + sha512(rand + "/" + method_name + "?" + convertToAuthUriParms(params) + "#" + secret);
  params.push(["apiSig", apiSig]);

  authParams = convertToAuthUriParms(params);

  var request = "https://codeforces.com/api/" + method_name + "?" + authParams;

  return UrlFetchApp.fetch(request);
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
