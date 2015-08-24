Trace = new Mongo.Collection("trace");


var App = {};

App.Const = {

    HoursLimit: 1,
    ResentCallsLimit: 20

}; // Const


App.Func = (function(AppConst) {
    
    function dateAddHours(hours) {
        var h = hours || AppConst.HoursLimit;
        var res = Date.today().addHours(-1 * hours);
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
    
    function resentCalls(limit) {
        var dl = limit || AppConst.ResentCallsLimit;
        var res = Trace.find({"Exception":{$ne: null}}, {sort: {"StartTime": -1}, limit: dl});
        return res;
    }
    
    function lastHourCalls(hours) {
        var isoDate = AppFunc.isoDateAddHours(hours);
        var res = Trace.find({"Exception":{$ne: null}, "StartTime":{$gt: isoDate}}, {sort: {"StartTime": -1}});
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
        var h = hours || AppConst.HoursLimit;
        Session.set('calls-hours-limit', h);
    }
    
    return {
        getResentCallsLimit: getResentCallsLimit,
        setResentCallsLimit: setResentCallsLimit,
        getHoursLimit: getHoursLimit,
        setHoursLimit: setHoursLimit
    };
    
}(App.Const)); // Session




if (Meteor.isClient) {
    
    App.Session.setResentCallsLimit(App.Const.ResentCallsLimit);
    Meteor.subscribe("calls-resent", App.Session.getResentCallsLimit());
    Meteor.subscribe("calls-last-hours", App.Session.setHoursLimit());

    Template.body.helpers({
        resentCalls: App.Db.resentCalls,
        resentCallsLimit: App.Session.getResentCallsLimit,
        lastHourCalls: App.Db.lastHourCalls
    });
    
} // Client




if (Meteor.isServer) {
    
    Meteor.startup(function () {
        // code to run on server at startup
    });
    
    Meteor.publish("calls-resent", function(limit) {
        return App.Db.resentCalls(limit);
    });
    
    Meteor.publish("calls-last-hours", function(hours) {
        return App.Db.lastHourCalls(hours);
    });
    
} // Server



Meteor.methods({

    
}); // methods

