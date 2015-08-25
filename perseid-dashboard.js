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
    
    function resentCalls(limit, errorsOnly) {
        var dl = limit || AppConst.ResentCallsLimit;
        var qry = (errorsOnly)
            ? {"Exception":{$ne: null}}
            : {}; 
        var prj = {sort: {"StartTime": -1}, limit: dl};
        
        console.log("resentCalls(): limit="+limit+",errorsOnly="+errorsOnly);
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
    
    function getFilterErrorsOnly() {
        var res = Session.get('filter-errors-only') || false;
        return res;
    }

    function setFilterErrorsOnly(errorsOnly) {
        Session.set('filter-errors-only', errorsOnly);
    }
    
    return {
        getResentCallsLimit: getResentCallsLimit,
        setResentCallsLimit: setResentCallsLimit,
        getHoursLimit: getHoursLimit,
        setHoursLimit: setHoursLimit,
        getFilterErrorsOnly: getFilterErrorsOnly,
        setFilterErrorsOnly: setFilterErrorsOnly
    };
    
}(App.Const)); // Session


App.Client = (function(AppConst, AppSession, AppDb) {

    return function() {
        
        AppSession.setResentCallsLimit(AppConst.ResentCallsLimit);
        AppSession.setFilterErrorsOnly(AppConst.ErrorsOnly);
        reSubResent();
        
        function reSubResent() {
            var limit = AppSession.getResentCallsLimit();
            var errorsOnly = AppSession.getFilterErrorsOnly();
            console.log("Subscribe \"calls-resent\": limit="+limit+", errorsOnly="+errorsOnly);
            Meteor.subscribe("calls-resent", limit, errorsOnly);
        }

        function reSubLastHour() {
            Meteor.subscribe("calls-last-hours", AppSession.getHoursLimit(), AppSession.getFilterErrorsOnly());
        }

        Template.body.helpers(function() {
            function resentCalls() {
                var limit = AppSession.getResentCallsLimit();
                var errorsOnly = AppSession.getFilterErrorsOnly();
                return AppDb.resentCalls(limit, errorsOnly);
            }
            
            return {
                resentCallsLimit: AppSession.getResentCallsLimit,
                resentCalls: resentCalls,
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
                errorsOnly: AppSession.getFilterErrorsOnly
            };
        }());
        
        Template.filter_form.events({
            
            "change #selLimit": function(event) {
                AppSession.setResentCallsLimit($(event.target).val());
                reSubResent();
            },

            "change #chkErrors": function(event) {
                AppSession.setFilterErrorsOnly(event.target.checked);
                reSubResent();
            },
            
            "submit #frmFilters": function(event) {
                event.preventDefault();
                console.dir(App.Db.resentCalls());
            }
            
        });
    };
    
}(App.Const, App.Session, App.Db));


App.Server = (function(AppDb) {
    
    return function() {
        Meteor.startup(function () {
            // code to run on server at startup
        });

        Meteor.publish("calls-resent", function(limit, errorsOnly) {
            console.log("Publish \"calls-resent\": limit="+limit+", errorsOnly="+errorsOnly);
            return AppDb.resentCalls(limit, errorsOnly);
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

