Trace = new Mongo.Collection("trace");


var App = {};

App.Const = {

    HoursLimit: 1,
    ResentCallsLimit: 20,
    ErrorsOnly: true
    
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
    
    function resentCalls(parms) {
        parms = parms || {};
        var criteria = [];
                
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
        
        var dl = parms.limit || AppConst.ResentCallsLimit;
        var prj = {sort: {"StartTime": -1}, limit: dl};
        
        console.log("Parameters:");
        console.dir(parms);
        console.log("Query:");
        console.dir(qry);
        console.log("Projection:");
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

    return function() {
        
        AppSession.setResentCallsLimit(AppConst.ResentCallsLimit);
        AppSession.setFilterErrorsOnly(AppConst.ErrorsOnly);
        AppSession.setRegex(AppConst.Regex);
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
            
            function resentCalls() {
                var parms = {
                    limit: AppSession.getResentCallsLimit(),
                    errorsOnly: AppSession.getFilterErrorsOnly(),
                    regex: AppSession.getRegex(),
					verb: AppSession.getVerb()
                };
                return AppDb.resentCalls(parms);
            }
            
            function summaryRows() {

                var res = [];
                var allRows = resentCalls().map(function(r) { return r; });
                
                _.each(allRows, function(element, index, list) {
                    
                    var method = element.Method;
                    var url = element.Url.split("?")[0];
                    var key = method + " " + url;

                    function finder(r) { return r["_id"] == key; }
                    
                    var row = _.find(res, finder)
                    if (!row) {
                        row = { 
                                "_id": key,
                                "Method": method,
                                "Url": url,
                                "Count": 0
                            };
                        res.push(row);
                    }
                    
                    row["Count"]++;                        
                });

                return _.sortBy(res, "Count").reverse();
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
            function isSelected(n) { return limit() == n ? "selected" : ""; }
            return {
                limit: limit,
                limitOf10:  function() { return isSelected(10); },
                limitOf20:  function() { return isSelected(20); },
                limitOf50:  function() { return isSelected(50); },
                limitOf100: function() { return isSelected(100); },
                limitOf500: function() { return isSelected(500); },
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
        
        
        Template.one_call.helpers(function(){
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

