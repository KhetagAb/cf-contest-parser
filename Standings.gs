const CONTEST_TITLE = 3;

// named ranges
const HANDLES_RANGE = "Handles";
const CONTEST_ID_RANGE = "ContestsId";
const CONTEST_ID_REVIEW_RANGE = "ContestsIdReview";
const STANDINGS_BEGIN_COLUMN_RANGE = "StandingsColumnBegin";
const STANDINGS_LAST_COLUMN_END_RANGE = "StandingsColumnEnd";

const bannedSubs = [233396647, 233397755];
const whiteListSubs = [233355044]

function checkCreationTimeConstraintForBan(submissionData) {
  if (bannedSubs.includes(submissionData.id)) {
    return true;
  } else if (whiteListSubs.includes(submissionData.id)) {
    return false;
  }
  var date = new Date(submissionData.creationTimeSeconds * 1000);
  var hours = date.getHours();
  var minutes = date.getMinutes();

  if (((hours < 17 && (16 <= hours || (hours == 15 && 35 <= minutes))) || 23 <= hours || hours < 6)) {
    console.log("Banned submission " + submissionData.problem.index + " with ID " + submissionData.id + ": " + hours + ":" + minutes)
    return true;
  } else {
    return false
  }
}

const VERDICT = { STARED: "❤️ 1", SOLVED: 1, RESOLVED: 0.99, TRIED: 0, REJECT: "RJ", WAITING: "?", BANNED: "BAN" };

const SUBMISSIONS_SHEET_NAME = "submissions"
const STARS_SHEET_NAME = "stars"

function displayAllStandings() {
  displayStandings("Группа - 1 - export");
  displayStandings("Группа - 2 - export");
  displayStandings("Группа - 3 - export");
  displayStandings("Группа - 4 - export");
}

const reviewedSubmissionIds = getSubmissionIds(SUBMISSIONS_SHEET_NAME)
const staredSubmissionIds = getSubmissionIds(STARS_SHEET_NAME)

// approve/get submission
function doGet(request) {
    const type = request["parameter"]["type"]
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(type == "star" ? STARS_SHEET_NAME : SUBMISSIONS_SHEET_NAME);
    if (type == 'get') {
      const values = sheet.getRange("A1:A").getValues().reduce((head, tail) => head.concat(tail)).filter(Boolean)
      values.shift();
      return ContentService.createTextOutput(JSON.stringify(values))
        .setMimeType(ContentService.MimeType.JSON);;
    } else {
      const submissionId = request["parameter"]["value"]
      sheet.appendRow([submissionId]);
    }
}

function getSubmissionIds(sheetName) {
   return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName).getRange("A:A").getValues().reduce((head, tail) => head.concat(tail)).filter(Boolean)
}

function displayStandings(tableName) {
  Logger.log("Going to display all results for " + tableName);

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (spreadsheet == null) {
    throw new Error("Cannot find spreadsheet.")
  }

  var handles = getValuesByRangeName(spreadsheet, tableName, HANDLES_RANGE);
  var contests = getValuesByRangeName(spreadsheet, tableName, CONTEST_ID_RANGE);

  var slice = contests.at(-1)
  if (slice < 0) {
    contests.pop();
    contests = contests.slice(slice);
  }

  var contestIdsToReview = getValuesByRangeName(spreadsheet, tableName, CONTEST_ID_REVIEW_RANGE);
  contests = contests.map(e => { 
    return {contest: new Contest(e), review: contestIdsToReview.includes(e), exam: false}
  });
  var contests = contests.sort((a, b) => a.contest.startTimeSeconds - b.contest.startTimeSeconds).reverse();

  Logger.log("There are " + contests.length + " contests.");

  var standingsBeginRow = getNamedRange(spreadsheet, tableName, HANDLES_RANGE).getRow()
  var standingsBeginColumn = getNamedRange(spreadsheet, tableName, STANDINGS_BEGIN_COLUMN_RANGE).getColumn();
  var standingsEndColumn = getNamedRange(spreadsheet, tableName, STANDINGS_LAST_COLUMN_END_RANGE).getColumn();

  var sheet = spreadsheet.getSheetByName(tableName)
  wellFormStandingRange(sheet, contests, standingsBeginColumn, standingsEndColumn)

  var standingsColumnPointer = standingsBeginColumn;

  for (var i = 0; i < contests.length; i++) {
    standingsColumnPointer = displayContest(sheet, contests, i, handles, standingsBeginRow, standingsColumnPointer);
  }
}

function contestSummary(contest, handles) {
  const contestTable = getTable(contest, handles)
  return contestTable.map(e => {
    const solved = e.reduce((a, b) => a + (b == VERDICT.STARED || b == VERDICT.SOLVED ? 1 : 0) , 0)
    const resolved = e.reduce((a, b) => a + (b == VERDICT.RESOLVED ? 1 : 0) , 0)
    return [solved, resolved];
  });
}

function wellFormStandingRange(sheet, contests, standingsBeginColumn, standingsEndColumn) {
  Logger.log("Preparing standings area for displaying contests");
  var allProblemsCount = contests.map(c => c.contest.problems.length).reduce((a, b) => a + b) + 2 * contests.length; 
  var allColumnsCount = (standingsEndColumn - standingsBeginColumn)
  var columnsToAdd = allProblemsCount - allColumnsCount
  if (columnsToAdd > 0) {
    sheet.insertColumnsAfter(standingsBeginColumn, columnsToAdd);
  } else if (columnsToAdd < 0) {
    sheet.deleteColumns(standingsEndColumn + columnsToAdd, -columnsToAdd);
  }
  Logger.log(allColumnsCount + " columns presented, and " + allProblemsCount + " needed for standings");
  sheet.getRange(CONTEST_TITLE - 1, standingsBeginColumn, 1, allColumnsCount).breakApart();
}

function displayContest(sheet, contests, contestIndex, handles, standingsRowIndex, pointerFrom) {
  Logger.log("Displaying contest #" + contestIndex);
  var contestEntity = contests[contestIndex];
  var problemsIndex = contestEntity.contest.problems.map(e => e.index);

  var summaryRange = sheet.getRange(standingsRowIndex, pointerFrom, handles.length, 2);
  summaryRange.setValues(contestSummary(contestEntity, handles));
  summaryRange
    .setBorder(null, null, null, true, false, false, "black", SpreadsheetApp.BorderStyle.DOUBLE);

  sheet.getRange(CONTEST_TITLE, pointerFrom, 1, problemsIndex.length + 2).setValues([['Σ', "Σ'", ...problemsIndex]]);
  sheet.getRange(CONTEST_TITLE - 1, pointerFrom, 1, problemsIndex.length + 2).merge().setValue(contestEntity.contest.name);

  pointerFrom += 2;
  var table = getTable(contestEntity, handles);

  sheet.getRange(standingsRowIndex, pointerFrom, handles.length, problemsIndex.length)
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
    if (contestRow == undefined) {
      table.push(new Array(problems.length).fill(null));
    } else {
      table.push(contestRow.getVerdict(review));
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

  getVerdict(review) {
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
  if (currentSubmission == null) {
    return lastSubmission
  } else if (currentSubmission.verdict == VERDICT.BANNED || currentSubmission.verdict == VERDICT.STARED || currentSubmission.verdict == VERDICT.SOLVED || currentSubmission.verdict == VERDICT.RESOLVED) {
    return currentSubmission
  } else {
    return lastSubmission;
  }
}

class Submission {
  constructor (submissionData, contest, problem) {
    this.id = submissionData.id;
    this.handle = submissionData.author.members[0].handle;

    this.problem = problem;
    
    var verdict;
    if (checkCreationTimeConstraintForBan(submissionData)) {
      verdict = VERDICT.BANNED;
    } else if (submissionData.verdict == "SKIPPED" || submissionData.verdict == "REJECTED") {
      verdict = VERDICT.REJECT;
    } else if (submissionData.verdict == "OK") {
      if (staredSubmissionIds.includes(submissionData.id)) {
        verdict = VERDICT.STARED;
      } else if (submissionData.relativeTimeSeconds <= contest.durationSeconds) {
        verdict = VERDICT.SOLVED;
      } else {
        verdict = VERDICT.RESOLVED;
      }
    } else {
      verdict = VERDICT.TRIED;
    }

    this.verdict = verdict;
  }

  getVerdict(review) {
    if (review && (this.verdict == VERDICT.SOLVED || this.verdict == VERDICT.RESOLVED) && !reviewedSubmissionIds.includes(this.id)) {
      return VERDICT.WAITING;
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
  Utilities.sleep(10);
  Logger.log("Getting contest standings for #" + contestId);
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

function getNamedRange(spreadsheet, tableName, rangeName) {
  return spreadsheet.getRangeByName("'" + tableName + "'!" + rangeName);
}

function getValuesByRangeName(spreadsheet, tableName, rangeName) {
  var values;
  try {
    values = getNamedRange(spreadsheet, tableName, rangeName).getValues();
  } catch (err) {
    throw new Error("Cannot find named range " + rangeName + ": " + err);
  }
  return values.reduce((head, tail) => head.concat(tail)).filter(Boolean);
}
