Trace = new Mongo.Collection("trace");


var App = {};

App.Const = {

    MinutesLimit: 10,
    ResentCallsLimit: 20,
    ErrorsOnly: false,
    
}; // Const


App.Func = (function(AppConst) {
    
    function dateAddMinutes(minutes) {
        var ml = minutes || AppConst.MinutesLimit;
        var res = Date.now().addMinutes(ml);
        return res;
    }
    
    function isoDateAddMinutes(minutes) {
        return dateAddMinutes(minutes).toISOString();
    }
    
    return {
        dateAddMinutes: dateAddMinutes,
        isoDateAddMinutes: isoDateAddMinutes
    };
    
}(App.Const)); // Func


App.Db = (function(AppConst, AppFunc){

    function getErrorsOnlyCriteria(parms, criteria) {
        if (parms.errorsOnly) {
            var criterion = {"Exception":{$ne: null}};
            criteria.push(criterion);
        }
    }
    
    function getRegexCriteria(parms, criteria) {
        if (parms.regex && parms.regex !== "") {
            var regexString = parms.regex;
            var criterion = {$or:[
                 {"Url": {$regex: regexString}}
                , {"HttpRequestContent": {$regex: regexString}}
            ]};
            criteria.push(criterion);
        }
    }
    
    function getVerbCriteria(parms, criteria) {
		if (parms.verb) {
            var criterion = {"Method": parms.verb};
            criteria.push(criterion);
		}
    }
    
    function getMinutesCriteria(parms, criteria) {
        if (parms.minutes) {
            var isoDate = AppFunc.isoDateAddMinutes(-1 * parms.minutes);
            var criterion = {"StartTime":{$gt: isoDate}};
            criteria.push(criterion);
        }
    }
    
    function getCriteriaToQry(criteria) {
        var qry = {};
        
        if (criteria.length > 1) {
            qry = {$and: criteria};
        }
        else if (criteria.length === 1) {
            qry = criteria[0];
        }
        else {
            qry = {};
        }
        
        return qry;
    }
    
    function getQryResentCalls(parms) {
        parms = parms || {};
        var criteria = [];
        
        getErrorsOnlyCriteria(parms, criteria);
        getRegexCriteria(parms, criteria);
        getVerbCriteria(parms, criteria);
        
        //And the criteria together
        var qry = getCriteriaToQry(criteria);
        return qry;
    }
    
    
    function resentCalls(parms) {
        parms = parms || {};
        var qry = getQryResentCalls(parms);
        
        var dl = parms.limit || AppConst.ResentCallsLimit;
        var prj = {sort: {"StartTime": -1}, limit: dl};
        
        console.log("==[resentCalls]==");
        console.log("--[Parameters]--"); console.dir(parms);
        console.log("--[Query]--"); console.dir(qry);
        console.log("--[Projection]--"); console.dir(prj);
        
        var res = Trace.find(qry, prj);
        return res;        
    }

    function getQryLastCalls(parms) {
        parms = parms || {};
        var criteria = [];
        getErrorsOnlyCriteria(parms, criteria);
        getRegexCriteria(parms, criteria);
        getVerbCriteria(parms, criteria);
        getMinutesCriteria(parms, criteria);
        
        //And the criteria together
        var qry = getCriteriaToQry(criteria);
        return qry;
    }
    
    
    function lastCalls(parms) {
        parms = parms || {};
        var qry = getQryLastCalls(parms);
        
        var prj = {sort: {"StartTime": -1}};
        
        console.log("==[lastCalls]==");
        console.log("--[Parameters]--"); console.dir(parms);
        console.log("--[Query]--"); console.dir(qry);
        console.log("--[Projection]--"); console.dir(prj);
        
        var res = Trace.find(qry, prj);
        return res;        
    }
    
    return {
        resentCalls: resentCalls,
        lastCalls: lastCalls
    };
    
}(App.Const, App.Func)); // Db


App.Session = (function(AppConst){

    function getResentCallsLimit() {
        var res = Session.get('calls-resent-limit') || AppConst.ResentCallsLimit;
        return res;
    }

    function setResentCallsLimit(limit) { 
        var dl = limit || AppConst.ResentCallsLimit;
        Session.set('calls-resent-limit', dl);
    }

    function getMinutesLimit() {
        var res = Session.get('calls-minutes-limit') || AppConst.MinutesLimit;
        return res;
    }
    
    function setMinutesLimit(minutes) {
        var hl = minutes || AppConst.MinutesLimit;
        Session.set('calls-minutes-limit', hl);
    }
	
	function getVerb() {
		var verb = Session.get('verb');
		return verb;
	}
	
	function setVerb(verb) {
		Session.set('verb', verb);
	}
    
    function getFilterErrorsOnly() {
        var res = Session.get('filter-errors-only') || false;
        return res;
    }

    function setFilterErrorsOnly(errorsOnly) {
        Session.set('filter-errors-only', errorsOnly);
    }
    
    function getRegex() {
        var regex = Session.get('regex');
        return regex;
    }
    
    function setRegex(regex) {
        Session.set('regex', regex);
    }
    
    return {
        getResentCallsLimit: getResentCallsLimit,
        setResentCallsLimit: setResentCallsLimit,
        getMinutesLimit: getMinutesLimit,
        setMinutesLimit: setMinutesLimit,
		getVerb: getVerb,
		setVerb: setVerb,
        getFilterErrorsOnly: getFilterErrorsOnly,
        setFilterErrorsOnly: setFilterErrorsOnly,
        getRegex: getRegex,
        setRegex: setRegex
    };
    
}(App.Const)); // Session

App.Client = (function(AppConst, AppSession, AppDb) {

    var pieChart = null;
    var pieMaxSegments = 7;
    var pieColors = [
        { color: "rgb(255,   0,   0)", highlight: "rgba(255, 0, 0, 0.5)", },
        { color: "rgb(245,  40,  40)", highlight: "rgba(245, 0, 0, 0.5)", },
        { color: "rgb(235,  80,  80)", highlight: "rgba(235, 0, 0, 0.5)", },
        { color: "rgb(225, 120, 120)", highlight: "rgba(225, 0, 0, 0.5)", },
        { color: "rgb(215, 140, 140)", highlight: "rgba(215, 0, 0, 0.5)", },
        { color: "rgb(205, 160, 160)", highlight: "rgba(205, 0, 0, 0.5)", },
        { color: "rgb(195, 180, 180)", highlight: "rgba(195, 0, 0, 0.5)", },
        { color: "rgb(185, 200, 200)", highlight: "rgba(185, 0, 0, 0.5)", },
    ];
    
    
    var lineChart = null;
    
    return function() {
        
        AppSession.setResentCallsLimit(AppConst.ResentCallsLimit);
        AppSession.setFilterErrorsOnly(AppConst.ErrorsOnly);
        reSubResent();
        reSubLast();
        
        function reSubResent() {
            var parms = {
                regex: AppSession.getRegex(),
				verb: AppSession.getVerb(),
                errorsOnly: AppSession.getFilterErrorsOnly(),
                limit: AppSession.getResentCallsLimit()
            };
            Meteor.subscribe("calls-resent", parms);
        }

        function reSubLast() {
            var parms = {
                regex: AppSession.getRegex(),
				verb: AppSession.getVerb(),
                errorsOnly: AppSession.getFilterErrorsOnly(),
                minutes: AppSession.getMinutesLimit()
            };
            Meteor.subscribe("calls-last", parms);
        }

        Template.body.helpers(function() {   
            
            function ApiCall(o) {
                
                this.time = o.StartTime;
                this.method = o.Method;
                this.ms = o.TotalTime;

                var urlParts = o.Url.split("?");
                this.url = urlParts[0];
                this.qs = (urlParts.length > 1) 
                    ? urlParts[1] 
                    : null;
                
                this.exception = (o.Exception)
                    ? {
                        message: o.Exception.Message
                    } : null;
                
                this.command = this.method + " " + this.url;
            }
            
            function resentCalls() {
                var parms = {
                    regex: AppSession.getRegex(),
					verb: AppSession.getVerb(),
                    errorsOnly: AppSession.getFilterErrorsOnly(),
                    limit: AppSession.getResentCallsLimit()
                };
                
                var res = AppDb.resentCalls(parms).map(function(o) { return new ApiCall(o); });;
                return res;
            }
            
            function lastCalls() {
                var parms = {
                    regex: AppSession.getRegex(),
					verb: AppSession.getVerb(),
                    errorsOnly: AppSession.getFilterErrorsOnly(),
                    minutes: AppSession.getMinutesLimit()
                };
                var res = AppDb.lastCalls(parms).map(function(o) { return new ApiCall(o); });
                return res;
            }
            
            function SummaryRow(o) {
                var _count = 0;
                var _totalTime = 0;
                
                this.command = o.command;
                this.method = o.method;
                this.url = o.url;
                
                this.getCount= function() { return _count; };
                this.increment = function() { _count++; };
                
                this.getTotalTime = function() { return Math.floor(_totalTime); };
                this.getAvgTime = function() { return Math.floor((_count<=0) ? 0 : _totalTime / _count); };
                this.addTime = function(t) { _totalTime += t; };
                

                this.same = function(other) { 
                    return this.command == other.command;
                };
            }
            
            function drawPieChart(rows) {
                
                Chart.defaults.global.responsive = true;
                
                var sumAll = _.reduce(rows, function(memo, row){ return memo + row.getCount(); }, 0);
                var sumCurr = 0
                    ,pieChartData = [];

                if (sumAll > 0) {
                    for(var i=0, len=rows.length; i<len; i++) {
                        
                        var row = rows[i];
                        var colors = pieColors[i];
                        if (i >= pieMaxSegments || sumCurr/sumAll > 0.9 || row.getCount()/sumAll < 0.1) {
                            pieChartData.push({
                                value: sumAll - sumCurr, 
                                label: "Other",
                                color: colors.color,
                                highlight: colors.highlight,
                            });
                            break;
                        }
                        
                        
                        pieChartData.push({
                            value: row.getCount(), 
                            label: row.command,
                            color: colors.color,
                            highlight: colors.highlight,
                        });
                        
                        sumCurr += row.getCount();
                    }
                }
                
                if (pieChart != null) {
                    pieChart.destroy();
                    pieChart = null;
                }
                
                var el = document.getElementById("pieChart");
                if (!el) { return; }

                var ctx = el.getContext("2d");
                if (!ctx) { return; }

                pieChart = new Chart(ctx).Pie(pieChartData, {animationSteps : 1});
            }
            
            
            function drawLineChart(rows) {
                var data = _.map(rows, function(r) { return r.count; });
                
                Chart.defaults.global.responsive = true;
                var lineChartData = {
                    labels: ["10min", "9min", "8min", "7min", "6min", "5min", "4min", "3min", "2min", "1min"],
                    datasets: [
                        {
                            label: "Count of API Calls",
                            fillColor: "rgba(155,120,120,0.2)",
                            strokeColor: "rgba(255,100,100,1)",
                            pointColor: "rgba(151,187,205,1)",
                            pointStrokeColor: "#fff",
                            pointHighlightFill: "#fff",
                            pointHighlightStroke: "rgba(251,107,205,1)",
                            data: data
                        }
                    ]
                };   

                if (lineChart != null) {
                    lineChart.destroy();
                    lineChart = null;
                }

                var el = document.getElementById("lineChart");
                if (!el) { return; }

                var ctx = el.getContext("2d");
                if (!ctx) { return; }
                
                lineChart = new Chart(ctx).Line(lineChartData, {animationSteps : 1});
                
            }
            
            function summaryRows() {

                var res = [];
                var allRows = resentCalls();
                
                _.each(allRows, function(apiCall, index, list) {
                    var summaryRow = new SummaryRow(apiCall);

                    function finder(r) { return r.same(key); }
                    
                    var row = _.find(res, function(r) { return r.same(summaryRow) });
                    if (!row) {
                        row = summaryRow;
                        res.push(row);
                    }

                    row.increment();
                    row.addTime(apiCall.ms);
                });

                var res = _.sortBy(res, function(r){ return r.getCount(); }).reverse();
                
                drawPieChart(res);
                
                return res;
            }
            
            
            function getLastRows() {

                var allRows= lastCalls();
                var currentDate = Date.now();
                var times = [
                    new Date(currentDate.getTime() - (10 * 60 * 1000)).toISOString(),
                    new Date(currentDate.getTime() - ( 9 * 60 * 1000)).toISOString(),
                    new Date(currentDate.getTime() - ( 8 * 60 * 1000)).toISOString(),
                    new Date(currentDate.getTime() - ( 7 * 60 * 1000)).toISOString(),
                    new Date(currentDate.getTime() - ( 6 * 60 * 1000)).toISOString(),
                    new Date(currentDate.getTime() - ( 5 * 60 * 1000)).toISOString(),
                    new Date(currentDate.getTime() - ( 4 * 60 * 1000)).toISOString(),
                    new Date(currentDate.getTime() - ( 3 * 60 * 1000)).toISOString(),
                    new Date(currentDate.getTime() - ( 2 * 60 * 1000)).toISOString(),
                    new Date(currentDate.getTime() + (10 * 60 * 1000)).toISOString()
                ];
                
                var res = [
                    {"minute": 10, "count": 0},
                    {"minute":  9, "count": 0},
                    {"minute":  8, "count": 0},
                    {"minute":  7, "count": 0},
                    {"minute":  6, "count": 0},
                    {"minute":  5, "count": 0},
                    {"minute":  4, "count": 0},
                    {"minute":  3, "count": 0},
                    {"minute":  2, "count": 0},
                    {"minute":  1, "count": 0}
                ];
                _.each(allRows, function(apiCall, index, list) {
                    if (!apiCall.time) { return; }
                    var apiDt = new Date(apiCall.time).toISOString();
                    for (var i=0; i<10; i++) {
                        var tDt = times[i];
                        if (apiDt <= tDt) {
                            res[i].count++;
                            break;
                        }
                    }
                });
                
                return res;
            }
            
            function showLastRows() {
                var lastRows = getLastRows();
                drawLineChart(lastRows);
                setTimeout(showLastRows,10000);
            }
            
            setTimeout(showLastRows, 3000);
            
            return {
                resentCallsLimit: AppSession.getResentCallsLimit,
                resentCalls: resentCalls,
                summaryRows: summaryRows,
                minutesLimit: AppSession.getMinutesLimit
            }
        }());

        Template.body.events({

        });

        Template.filter_form.helpers(function(){
            function limit() { return AppSession.getResentCallsLimit(); }
            function verb() { var verb = AppSession.getVerb(); }
            function isSelected(f, v) { return f() == v ? "selected" : ""; }
            return {
                limit: limit,  
                verb: verb,
                
                limitOf10:  function() { return isSelected(limit, 10);    },
                limitOf20:  function() { return isSelected(limit, 20);    },
                limitOf50:  function() { return isSelected(limit, 50);    },
                limitOf100: function() { return isSelected(limit, 100);   },
                limitOf500: function() { return isSelected(limit, 500);   },
                
                verbAny:    function() { return isSelected(verb, "Any");  },
                verbGet:    function() { return isSelected(verb, "GET");  },
                verbPost:   function() { return isSelected(verb, "POST"); },
                verbPut:    function() { return isSelected(verb, "PUT");  },
                
                errorsOnly: AppSession.getFilterErrorsOnly,
                regex: AppSession.getRegex
            };
        }());
        
        Template.filter_form.events({
		
            "keyup #txtContains": function(event) {
                AppSession.setRegex($(event.target).val());
                reSubResent();
                reSubLast();
            },
            
			"change #selVerb": function(event) {
				var verb = $(event.target).val();
				if (verb === "Any") {
					verb = null;
				}
				AppSession.setVerb(verb);
                reSubResent();
                reSubLast();
			},
            
            "change #selLimit": function(event) {
                var limitStr = $(event.target).val();
                var limit = parseInt(limitStr);
                AppSession.setResentCallsLimit(limit);
                reSubResent();
                reSubLast();
            },

            "change #chkErrors": function(event) {
                AppSession.setFilterErrorsOnly(event.target.checked);
                reSubResent();
            }
        });
        
        
        Template.resent_call.helpers(function(){
            return {
                localTime: function(d) { return new Date(d).toLocaleString(); }
            };
        }());
        
    };
    
}(App.Const, App.Session, App.Db));


App.Server = (function(AppDb) {
    
    return function() {
        Meteor.startup(function () {
            // code to run on server at startup
        });

        Meteor.publish("calls-resent", function(parms) {
            return AppDb.resentCalls(parms);
        });

        Meteor.publish("calls-last", function(parms) {
            return AppDb.lastCalls(parms);
        });
    }
    
}(App.Db));



if (Meteor.isClient) { App.Client(); }

if (Meteor.isServer) { App.Server(); }

Meteor.methods({

    
}); // methods

