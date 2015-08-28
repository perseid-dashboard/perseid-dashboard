Trace = new Mongo.Collection("trace");


var App = {};

App.Const = {

    HoursLimit: 1,
    ResentCallsLimit: 20,
    ErrorsOnly: false,
    
}; // Const


App.Func = (function(AppConst) {
    
    function dateAddHours(hours) {
        var hl = hours || AppConst.HoursLimit;
        var res = Date.today().addHours(-1 * hl);
        return res;
    }
    
    function isoDateAddHours(hours) {
        return dateAddHours(hours).toISOString();
    }
    
    return {
        dateAddHours: dateAddHours,
        isoDateAddHours: isoDateAddHours
    };
    
}(App.Const)); // Func


App.Db = (function(AppConst, AppFunc){
    
    /*
     * Gets the common part of the Mongo query for both resentCalls and lastCalls
     */
    function getQry(parms) {
        parms = parms || {};
        var criteria = [];
        var qry = {};
        
        if (parms.errorsOnly) {
            criteria.push({"Exception":{$ne: null}});
        }

        if (parms.regex && parms.regex !== "") {
            var regexString = parms.regex;
            var regexCriterion = {$or:[
                 {"Url": {$regex: regexString}}
                , {"HttpRequestContent": {$regex: regexString}}
            ]};
            criteria.push(regexCriterion);
        }

		if (parms.verb) {
            var verbCriterion = {"Method": parms.verb};
            criteria.push(verbCriterion);
		}
        
        //And the criteria together
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
    
    
    function resentCalls(parms) {
        parms = parms || {};
        var qry = getQry(parms);
        
        var dl = parms.limit || AppConst.ResentCallsLimit;
        var prj = {sort: {"StartTime": -1}, limit: dl};
        
        console.log("--[Parameters]--");
        console.dir(parms);
        console.log("--[Query]--");
        console.dir(qry);
        console.log("--[Projection]--");
        console.dir(prj);
        
        var res = Trace.find(qry, prj);
        return res;        
    }

    function lastHourCalls(hours, errorsOnly) {
        var isoDate = AppFunc.isoDateAddHours(hours);
        var qry = (errorsOnly)
            ? {"Exception":{$ne: null}, "StartTime":{$gt: isoDate}}
            : {"StartTime":{$gt: isoDate}}; 
        var prj = {sort: {"StartTime": -1}};
        var res = Trace.find(qry, prj);
        return res;
    }
    
    return {
        resentCalls: resentCalls,
        lastHourCalls: lastHourCalls
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

    function getHoursLimit() {
        var res = Session.get('calls-hours-limit') || AppConst.HoursLimit;
        return res;
    }
    
    function setHoursLimit(hours) {
        var hl = hours || AppConst.HoursLimit;
        Session.set('calls-hours-limit', hl);
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
        getHoursLimit: getHoursLimit,
        setHoursLimit: setHoursLimit,
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
    
    
    return function() {
        
        AppSession.setResentCallsLimit(AppConst.ResentCallsLimit);
        AppSession.setFilterErrorsOnly(AppConst.ErrorsOnly);
        reSubResent();
        
        function reSubResent() {
            var regex = AppSession.getRegex();
			var verb = AppSession.getVerb();
            var limit = AppSession.getResentCallsLimit();
            var errorsOnly = AppSession.getFilterErrorsOnly();
            console.log("Subscribe \"calls-resent\": regex="+regex+", verb:"+verb+", limit="+limit+", errorsOnly="+errorsOnly);
            var parms = {
                limit: limit,
                errorsOnly: errorsOnly,
                regex: regex,
				verb: verb
            };
            Meteor.subscribe("calls-resent", parms);
        }

        function reSubLastHour() {
            Meteor.subscribe("calls-last-hours", AppSession.getHoursLimit(), AppSession.getFilterErrorsOnly());
        }

        Template.body.helpers(function() {   
            
            function ApiCall(o) {
                
                this.time = o.StartTime;
                this.method = o.Method;

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
                    limit: AppSession.getResentCallsLimit(),
                    errorsOnly: AppSession.getFilterErrorsOnly(),
                    regex: AppSession.getRegex(),
					verb: AppSession.getVerb()
                };
                var res = AppDb.resentCalls(parms).map(function(o) { return new ApiCall(o); });;
                return res;
            }
            
            function SummaryRow(o) {
                var _count = 0;
                
                this.command = o.command;
                this.method = o.method;
                this.url = o.url;
                
                this.getCount= function() { return _count; };
                this.increment = function() { _count++; };

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
                            label: i + 1,
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
                });

                var res = _.sortBy(res, function(r){ return r.getCount(); }).reverse();
                drawPieChart(res);
                
                return res;
            }
            
            return {
                resentCallsLimit: AppSession.getResentCallsLimit,
                resentCalls: resentCalls,
                summaryRows: summaryRows,
                lastHourCalls: AppDb.lastHourCalls
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
		
			"change #selVerb": function(event) {
				var verb = $(event.target).val();
				if (verb === "Any") {
					verb = null;
				}
				AppSession.setVerb(verb);
                reSubResent();
			},
            
            "change #selLimit": function(event) {
                var limitStr = $(event.target).val();
                var limit = parseInt(limitStr);
                AppSession.setResentCallsLimit(limit);
                reSubResent();
            },

            "change #chkErrors": function(event) {
                AppSession.setFilterErrorsOnly(event.target.checked);
                reSubResent();
            },
            
            "keyup #txtContains": function(event) {
                AppSession.setRegex($(event.target).val());
                reSubResent();
            },
            
            "submit #frmFilters": function(event) {
                event.preventDefault();
                AppSession.setRegex()
                console.dir(App.Db.resentCalls());
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

        Meteor.publish("calls-last-hours", function(hours, errorsOnly) {
            return AppDb.lastHourCalls(hours, errorsOnly);
        });
    }
    
}(App.Db));



if (Meteor.isClient) { App.Client(); }

if (Meteor.isServer) { App.Server(); }

Meteor.methods({

    
}); // methods

