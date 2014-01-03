function idFromLabel(label) {
    return label.replace(/\W/g, '');
}

function camelCaseToLabel(name) {
    if (name.indexOf('.') > 0) name = name.split('.')[1];
    return name.replace(/([A-Z])/g, ' $1').replace(/^./, function(str){ return str.toUpperCase(); });
}

function endsWith(label, char) {
    return label.indexOf(char, label.length - char.length) !== -1;
}

// Very simplistic way to turn plural words into singular words
// NOTE: only works on words that end with an 's'.
function singularize(label) {
    label = camelCaseToLabel(label);
    if (endsWith(label, 's')) {
        return label.substring(0, label.length - 1);
    } else {
        return label;
    }
}

function getField(field, name) {
    var defaults = {
        label: camelCaseToLabel(name),

        // signature for options that take functions: (value, doc, modifier)

        // basic validation
        type: 'string',          // validated with typeof check
        required: true,          // or function
        min: null,
        max: null,
        numberStep: null,        // the HTML "step" attribute for 'number' type
        regEx: null,             // or function
        regExMessage: null,      // or function
        customValidation: null,  // function, return [value, error_string] (if no error, set error_string to '')

        // display-related options
        placeholder: '',         // or null to use label for placeholder
        options: null,           // or function
        widget: 'text',
        hidden: false,           // or function
        default: null,           // or function
    };

    var f = _.extend(defaults, field);
    f.name = name;
    if (f.options && !field.widget) f.widget = 'select';
    if (f.type === 'boolean' && !field.widget) f.widget = 'checkbox';
    if (f.type === 'boolean' && !field.options) f.options = [
        {value: true, label: 'Yes'},
        {value: false, label: 'No'}
    ];
    if (f.type === 'boolean' && f.options && f.options.length > 2) throw new Meteor.Error('Boolean can only have two options');

    // convenience method
    f.validate = function(value) {
        return validateField(f, value);
    };

    return f;
}

// handles field options that optionally use functions
function getOption(userId, option, value, doc, modifier) {
    if (typeof option == 'function') {
        return option(userId, value, doc, modifier);
    } else {
        return option;
    }
}

// gets properly formatted list of allow values and labels for a field
function getFieldOptions(userId, field, value, doc, modifier) {
    var options = getOption(userId, field.options, value, doc, modifier);
    if (!options) return options;

    var newOptions = [];
    if (!_.isEmpty(options)) {
        for (var i = 0; i < options.length; i++) {
            if (typeof options[i] == 'object') newOptions.push(options[i]);
            else {
                newOptions.push({value: options[i], label: options[i]});
            }
        }
    }

    return newOptions;
}

function getValue(element) {
    if (element.type == 'checkbox') {
        return element.checked;
    } else {
        return $(element).val();
    }
}

function cleanField(field, value) {
    if (value === null || value === undefined) return value;

    if (field.type == 'number') {
        if (value === '') return undefined;
        if ((typeof value) != 'number') value = Number(value);
    } else if (field.type == 'boolean') {
        if ((typeof value) != 'boolean') {
            if (value === '' || value == '0' || value === 0 || value == 'false') value = false;
            else value = true;
        }
    }

    return value;
}

function validateField(userId, field, value, doc, modifier) {
    if (getOption(userId, field.required, value, doc, modifier) && (value === null || value === undefined || value === '')) return [value, 'This field is required'];
    if (value !== null && value !== undefined && value !== '') {
        if (field.type == 'number') {
            if (field.min && value < field.min) return [value, 'Minimum value is ' + field.min];
            if (field.max && value > field.max) return [value, 'Maximum value is ' + field.max];
        } else if (field.type == 'string' && field.widget != 'list') {
            if (field.min && value.length < field.min) return [value, 'Minimum length is ' + field.min];
            if (field.max && value.length > field.max) return [value, 'Maximum length is ' + field.max];
        }

        if (field.type == 'string') {
            var regEx = getOption(userId, field.regEx, value, doc, modifier);
            if (regEx && value.match(regEx) === null) {
                var regExMessage = getOption(userId, field.regExMessage, value, doc, modifier);
                if (regExMessage) return [value, regExMessage];
                else return [value, 'Does not match pattern'];
            }
        }

        if (field.widget == 'list') {
            var l = [];
            for (var x = 0; x < value.length; x++) {
                var val = value[x];
                if (val) l.push(val);
            }
            if (field.min && _.keys(l).length < field.min) return [value, 'List must have at least ' + field.min + ' items'];
            if (field.max && _.keys(l).length > field.max) return [value, 'List has too many items (max ' + field.max + ')'];
            value = l;
        }

        var options = getFieldOptions(userId, field, value, doc, modifier);
        if (options) {
            var found = false;
            for (var i = 0; i < options.length; i++) {
                var opt = options[i];
                if (value == opt.value) {
                    found = true;
                    break;
                }
            }
            if (!found) return [value, 'Not a valid option'];
        }

        if (field.customValidation) {
            var result = field.customValidation(field, value, doc, modifier);
            return result;
        }
    }

    return [value, ''];
}

function validate(userId, fields, doc, modifier) {
    var foundFields = {};
    if (modifier) {
        if ('$set' in modifier) {
            _.each(modifier.$set, function(item, name) {
                foundFields[name] = item;
            });
        }
    } else {
        _.each(doc, function(item, name) {
            var parentName = name;
            if (typeof item == 'object' && !_.isArray(item)) {
                _.each(item, function(subItem, subName) {
                    foundFields[parentName + '.' + subName] = subItem;
                });
            } else {
                foundFields[name] = item;
            }
        });
    }

    var errorMessages = {};
    _.each(foundFields, function(item, name) {
        if (name in fields) {
            var field = fields[name];
            var result = validateField(userId, field, item, doc, modifier);
            if (result[1]) errorMessages[name] = result[1];
        }
    });

    _.each(fields, function(item, name) {
        if (!getOption(userId, item.required, item.required, doc, modifier)) return;
        if (getOption(userId, item.hidden, item.hidden, doc, modifier)) return;
        if (!(name in foundFields)) {
            errorMessages[name] = 'Field not found';
        }
    });

    return [foundFields, errorMessages];
}

function addListField(field, value) {
    if (!value) value = '';
    var html = '<div>';
    html += '<span class="handle glyphicon glyphicon-resize-vertical"></span>';
    html += '<input type="text" class="form-control" name="' + field.name + '[]" value="' + value + '" />';
    html += '<button type="button" class="btn btn-danger" onclick="CrudForm.removeListField(this);"><span class="glyphicon glyphicon-remove"></span></button>';
    html += '</div>';
    return html;
}

function renderFieldWidget(userId, field, value, doc, modifier) {
    value = cleanField(field, value);
    if (value === null) value = '';
    if (!value && !doc && !modifier && field.default !== null) value = getOption(userId, field.default, value);
    var options = getFieldOptions(userId, field, value, doc, modifier);
    var regExToString = function(regEx) {
        return regEx.toString().slice(1, -1).replace('"', '&quot;');
    };

    var html = '';

    if (field.widget == 'hidden') {
        html += '<input type="hidden" name="' + field.name + '" value="' + value + '" />';
    } else if (field.widget == 'radio') {
        for (var i = 0; i < options.length; i++) {
            var option = options[i];
            html += '<input type="radio" class="form-control" name="' + field.name + '" value="' + option.value + '"';
            if (value == option.value) html += ' checked="checked"';
            html += '>' + option.label + '</input>';
        }
    } else if (field.widget == 'list') {
        html += '<br /><button type="button" class="btn btn-default" name="' + field.name + '" onclick="CrudForm.addListField(this);">New ' + field.label + '</button>';
        html += '<div class="crud-field-list">';
        if (_.isArray(value)) {
            for (var x = 0; x < value.length; x++) {
                html += addListField(field, value[x]);
            }
            setTimeout(CrudForm.sortableListField, 500);  // hack to enable sorting without clickingc
        }
        html += '</div>';
    } else {
        if (field.widget == 'select') html += '<select ';
        else if (field.widget == 'textarea') html += '<textarea ';
        else if (field.widget == 'checkbox') html += '<input type="checkbox" ';
        else html += '<input type="' + field.widget + '" ';
        html += 'class="form-control" name="' + field.name + '"';
        html += ' onblur="CrudForm.validateField(this);"';

        if (field.widget == 'textarea') {
            html += '>' + _.escape(value) + '</textarea>';
            return html;
        } else if (field.widget == 'checkbox') {
            if (value) html += ' checked="checked"';
            html += ' />';
            return html;
        } else if (field.widget == 'select') {
            html += '>';
            if (!getOption(userId, field.required, value)) html += '<option value="">(none)</option>';
            for (var j = 0; j < options.length; j++) {
                html += '<option value="' + options[j].value + '"';
                if (value == options[j].value) html += ' selected="selected"';
                html += '>' + options[j].label + '</option>';
            }
            html += '</select>';
            return html;
        } else if (field.type == 'number' && field.min !== null && field.max !== null) {
            html += ' min="' + field.min + '" max="' + field.max + '"';
            if (field.numberStep) html += ' step="' + field.numberStep + '"';
        }
        
        if (field.regEx) {
            html += ' pattern="' + regExToString(field.regEx) + '"';
        }

        html += ' value="' + value + '" />';
    }

    return html;
}

function renderLabelWidget(field) {
    if (field.widget == 'hidden') return '';  // label is taken care of already
    return '<label for="' + field.name + '">' + field.label + '</label>';
}

function renderField(userId, field, value, doc, modifier, error) {
    var hidden = getOption(userId, field.hidden, value, doc, modifier);
    if (hidden) return '';
    if (field.widget == 'hidden') return renderFieldWidget(userId, field, value, doc, modifier);

    var html = '<div class="form-group crudField' + field.name;
    if (error) html += ' has-error';
    html += '">';
    html += renderLabelWidget(field);
    html += renderFieldWidget(userId, field, value, doc, modifier);
    if (error) html += '<p class="help-block">' + error + '</p>';
    else html += '<p class="help-block"></p>';
    html += '</div>';
    return html;
}

function renderForm(userId, crudForm, doc, modifier) {
    var values = {};
    var errors = {};
    if (doc || modifier) {
        var results = validate(userId, crudForm.fields, doc, modifier);
        values = results[0];
        errors = results[1];
    }

    var html = '<form onsubmit="return CrudForm.formSubmitted(this);" data-form-name="' + crudForm.formName + '">';
    
    for (var name in crudForm.fields) {
        if (crudForm.fields.hasOwnProperty(name)) {
           var field = crudForm.fields[name];
           var value = null;
            if (name in values) value = values[name];
            var error = null;
            if (name in errors) error = errors[name];
            html += renderField(userId, field, value, doc, modifier, error);
        }
    }

    html += '<button type="submit" class="btn btn-primary btn-block">Submit</button>';
    return html + '</form>';
}

function renderModalForm(userId, crudForm, doc, modifier) {
    var values = {};
    var errors = {};
    if (doc || modifier) {
        var results = validate(userId, crudForm.fields, doc, modifier);
        values = results[0];
        errors = results[1];
    }

    var html = '<div class="modal ' + crudForm.modalName + '">';
    html += '<div class="modal-dialog"><div class="modal-content">';
    html += '<form onsubmit="return CrudForm.formSubmitted(this);" data-form-name="' + crudForm.formName + '">';
    html += '<div class="modal-header"><button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>';
    html += '<h4 class="modal-title">' + crudForm.label + '</h4></div>';
    html += '<div class="modal-body">';
    
    for (var name in crudForm.fields) {
        if (crudForm.fields.hasOwnProperty(name)) {
            var field = crudForm.fields[name];
            var value = null;
            if (name in values) value = values[name];
            var error = null;
            if (name in errors) error = errors[name];
            html += renderField(userId, field, value, doc, modifier, error);
        }
    }

    html += '</div>';
    html += '<div class="modal-footer">';
    html += '<button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>';
    html += '<button type="submit" class="btn btn-primary">Submit</button>';
    html += '</div></div></div></form></div>';

    return html;
}

function objFromName(formName) {
    var crudForm = null;
    _.each(CrudFormInstances, function(item, name) {
        if (name == formName) {
            crudForm = item;
            return;
        }
    });
    return crudForm;
}

// takes a form element and the collection.formName and returns
// the doc and modifier objects for insert and update
function formToObject(target, formName) {
    var crudForm = objFromName(formName);
    var doc = {};
    var modifier = {$set: {}};
    var setOrAppend = function(existing, name, val) {
        if (name.indexOf('[') > 0) {
            if (existing === undefined) existing = [];
            if (val) existing.push(val);
            return existing;
        } else {
            return val;
        }
    };

    $('.form-control', target).each(function(iter, item) {
        var singleName = item.name.replace('[]', '');
        var field = crudForm.fields[singleName];
        var value = cleanField(field, getValue(item));
        modifier.$set[singleName] = setOrAppend(modifier.$set[singleName], item.name, value);

        if (item.name.indexOf('.') > 0) {
            var fieldnames = item.name.split('.', 2);
            var obj = {};
            if (fieldnames[0] in doc) obj = doc[fieldnames[0]];

            obj[fieldnames[1].replace('[]', '')] = setOrAppend(doc[fieldnames[0]], fieldnames[1], value);
            doc[fieldnames[0]] = obj;
        } else {
            doc[singleName] = setOrAppend(doc[singleName], item.name, value);
        }
    });

    return {doc: doc, modifier: modifier};
}

CrudFormInstances = {};

CrudForm = function(collection, options) {
    if (!(this instanceof CrudForm)) throw new Meteor.Error('Use the "new" on for CrudForm');
    if (!collection) throw new Meteor.Error('Must provide collection name or Meteor.Collection');
    if (typeof collection == 'string') collection = new Meteor.Collection(collection);
    if (!collection instanceof Meteor.Collection) throw new Meteor.Error('Must provide a Meteor.Collection');
    if (!options) throw new Meteor.Error('Must provide options');

    var self = this;
    this.collection = collection;
    this.fields = [];
    var defaults = {
        label: singularize(collection._name),
        properties: {},
        handleAllow: true,   // allow by default
        logValidationFailures: true,
        beforeInsert: null,  // function(userId, doc), return false to cancel
        beforeUpdate: null,  // function(userId, doc, fields, modifier), return false to cancel
        beforeRemove: null,  // function(userId, doc), return false to cancel
        beforeSubmit: null,  // function(action, doc, modifier, editId), return false to cancel (client-only, before validation)
        afterInsert: null,   // function(userId, doc)
        afterUpdate: null,   // function(userId, doc, fields, modifier)
        afterRemove: null,   // function(userId, doc)
        afterSubmit: null,   // function(action, doc, modifier, editId), return false to cancel (client-only, after validation for custom db writing)
        disableServerValidation: false // prevents server-side validation
    };
    
    if ('fields' in options) {
        _.each(options.fields, function(field, name) {
            self.fields[name] = getField(field, name);
        });
    }
    
    this.options = _.extend(defaults, options);
    this.label = this.options.label;
    this.formName = idFromLabel('crudForm' + this.label);
    this.modalName = idFromLabel('modal' + this.label);

    if (this.options.handleAllow) {
        this.collection.allow({
            insert: function() { return true; },
            update: function() { return true; },
            remove: function() { return true; }
        });
    }

    this.collection.before.insert(function(userId, doc) {
        if (self.options.beforeInsert && self.options.beforeInsert(userId, doc) === false) return false;
        if (Meteor.isClient || !self.options.disableServerValidation) {
            var result = self.validate(userId, doc);
            if (!_.isEmpty(result[1])) {
                if (self.options.logValidationFailures) console.log(result);
                return false;
            }
        }
    });
    this.collection.before.update(function(userId, doc, fields, modifier, options) {
        if (self.options.beforeUpdate && self.options.beforeUpdate(userId, doc, fields, modifier) === false) return false;
        if (Meteor.isClient || !self.options.disableServerValidation) {
            var result = self.validate(userId, doc, modifier);
            if (!_.isEmpty(result[1])) {
                if (self.options.logValidationFailures) console.log(result);
                return false;
            }
        }
    });
    this.collection.before.remove(function(userId, doc) {
        if (self.options.beforeRemove && self.options.beforeRemove(userId, doc) === false) return false;
    });

    if (this.options.afterInsert) {
        this.collection.after.insert(this.options.afterInsert);
    }

    if (this.options.afterUpdate) {
        this.collection.after.update(this.options.afterUpdate);
    }

    if (this.options.afterRemove) {
        this.collection.after.remove(this.options.afterRemove);
    }

    CrudFormInstances[this.formName] = this;
};

// class functions
CrudForm.sortableListField = function() {
    try { $('.crud-field-list').sortable('destroy'); } catch (err) {}
    $('.crud-field-list').sortable({
        axis: 'y',
        handle: '.handle'
    });
};

CrudForm.addListField = function(element) {
    var formName = $(element).closest('form').data('form-name');
    var crudForm = objFromName(formName);
    var field = crudForm.fields[element.name];
    var html = addListField(field);
    $(element).next('.crud-field-list').append(html);
    CrudForm.sortableListField();
};

CrudForm.removeListField = function(element) {
    $(element).closest('div').remove();
    CrudForm.sortableListField();
};

CrudForm.validateField = function(element) {
    var formName = $(element).closest('form').data('form-name');
    var crudForm = objFromName(formName);
    var field = crudForm.fields[element.name.replace('[]', '')];
    var value = cleanField(field, getValue(element));
    var group = $(element).parent('.crudField' + field.name);
    var result = validateField(Meteor.userId(), field, value);
    if (result[1]) {
        $(group).addClass('has-error');
        $('.help-block', group).text(result[1]);
    } else {
        $(group).removeClass('has-error');
        $('.help-block', group).text('');
    }

    return result;
};

CrudForm.formSubmitted = function(element) {
    var formName = $(element).data('form-name');
    var crudForm = objFromName(formName);
    var obj = formToObject(element, formName);
    var editId = Session.get('crud-edit-id');
    var action = 'insert';

    if (editId) action = 'update';
    if (crudForm.options.beforeSubmit && crudForm.options.beforeSubmit(action, obj.doc, obj.modifier, editId) === false) return false;

    var results = {};

    $('.form-control', element).each(function(iter, item) {
        var result = CrudForm.validateField(item);
        if (result[1]) results[item.name.replace('[]', '')] = result[1];
    });

    if (!_.isEmpty(results)) console.log('Form validation failed: ', results);
    else {
        if (crudForm.options.afterSubmit) {
            crudForm.options.afterSubmit(action, obj.doc, obj.modifier, editId);
        }

        if (editId) crudForm.update({_id: editId}, obj.modifier, editId);
        else crudForm.insert(obj.doc);

        $('.' + crudForm.modalName).modal('hide');
    }

    return false;
};

CrudForm.newModalForm = function(formName) {
    var crudForm = objFromName(formName);
    $('.' + crudForm.modalName).remove();
    $(document.body).append(renderModalForm(Meteor.userId(), crudForm));
    $('.' + crudForm.modalName).modal('show');
    Session.set('crud-edit-id', undefined);
};

CrudForm.editModalForm = function(formName, id) {
    var crudForm = objFromName(formName);
    $('.' + crudForm.modalName).remove();
    var doc = crudForm.fetchOne({_id: id});
    $(document.body).append(renderModalForm(Meteor.userId(), crudForm, doc));
    $('.' + crudForm.modalName).modal('show');
    Session.set('crud-edit-id', id);
};

CrudForm.confirmRemove = function(formName, id) {
    var crudForm = objFromName(formName);
    Modal.confirm({
        message: 'Are you sure you want to remove this ' + crudForm.label + '?',
        title: 'Confirm Removal',
        buttonText: 'Remove',
        buttonClass: 'btn-danger',
        callback: function() {
            crudForm.remove({_id: id});
        }
    });
};

// instance functions
CrudForm.prototype.validateField = function(field, value, doc, modifier) {
    return validateField(Meteor.userId(), field, value, doc, modifier);
};

CrudForm.prototype.validate = function(doc, modifier) {
    return validate(Meteor.userId(), this.fields, doc, modifier);
};

CrudForm.prototype.renderForm = function(doc, modifier) {
    return renderForm(Meteor.userId(), this, doc, modifier);
};

CrudForm.prototype.renderModalForm = function(doc, modifier) {
    return renderModalForm(Meteor.userId(), this, doc, modifier);
};


// Passthrough methods
CrudForm.prototype.allow = function(args) {
    return this.collection.allow(args);
};

CrudForm.prototype.deny = function(args) {
    return this.collection.deny(args);
};

CrudForm.prototype.insert = function(/* arguments */) {
    return this.collection.insert.apply(this.collection, arguments);
};

CrudForm.prototype.update = function(/* arguments */) {
    return this.collection.update.apply(this.collection, arguments);
};

CrudForm.prototype.remove = function(/* arguments */) {
    return this.collection.remove.apply(this.collection, arguments);
};

CrudForm.prototype.find = function(/* arguments */) {
    return this.collection.find.apply(this.collection, arguments);
};

CrudForm.prototype.findOne = function(/* arguments */) {
    return this.collection.findOne.apply(this.collection, arguments);
};

// Assigns options.properties to a document
CrudForm.prototype.applyProperties = function(doc) {
    if (!doc) return;
    _.each(this.options.properties, function(fn, key) {
        doc[key] = fn(doc);
    });
};

// Custom method that calls find, then runs applyProperties to apply
// all options.properties to all objects found.
CrudForm.prototype.fetch = function(/* arguments */) {
    var docs = this.collection.find.apply(this.collection, arguments).fetch();
    for (var i = 0; i < docs.length; i++) {
        this.applyProperties(docs[i]);
    }
    return docs;
};

// Custom method that calls findOne, then runs applyProperties to apply
// all options.properties to the found object.
CrudForm.prototype.fetchOne = function(/* arguments */) {
    var doc = this.collection.findOne.apply(this.collection, arguments);
    if (doc) this.applyProperties(doc);
    return doc;
};


// Handlebars helpers
if (typeof Handlebars !== 'undefined' && Meteor.isClient) {
    // Renders a table to list each row in the given collection, allow with New, Edit, and Remove buttons
    // label: The name for the type of item represented (i.e User, Message, etc)
    // collection: A collection cursor
    // fields: List of {name, label] to show for each document
    // allowNew: true or false (default: true)
    // allowEdit: true or false (default: true)
    // allowRemove: true or false (default: true)
    // rowCallback: function(item, field, value)
    Handlebars.registerHelper('crudList', function(options) {
        var defaults = {
            crudForm: null,
            fields: null,
            selector: {},
            allowNew: true,
            allowEdit: true,
            allowRemove: true,
            rowCallback: null
        };

        options = _.extend(defaults, options);

        if (!options.crudForm) throw new Error('Must supply CrudForm');
        if (!options.fields) options.fields = _.keys(options.crudForm.fields);
        if (!options.fields) throw new Error('CrudForm does not have fields defined');
        var rows = [];

        if (_.isArray(options.selector)) {
            rows = options.crudForm.fetch(options.selector[0], options.selector[1]);
        } else {
            rows = options.crudForm.fetch(options.selector);
        }

        var html = '';
        if (options.allowNew)
            html += '<button type="button" class="btn btn-primary btn-new" onclick="CrudForm.newModalForm(\'' + options.crudForm.formName + '\');">New ' + options.crudForm.label + '</button>';

        html += '   <table class="table table-condensed table-border"><tr>';
        for (var i = 0; i < options.fields.length; i++) {
            var field_name = options.fields[i];
            var label = options.crudForm.fields[field_name].label;
            html += '<th>' + label + '</th>';
        }
        html += '</tr>';
        for (var row = 0; row < rows.length; row++) {
            var item = rows[row];
            if (!item) continue;
            html += '<tr>';
            for (var col = 0; col < options.fields.length; col++) {
                var field = options.crudForm.fields[options.fields[col]];
                if (!field) continue;

                html += '<td>';
                if (col === 0) {
                    if (options.allowEdit) html += '<button type="button" class="btn btn-default btn-xs btn-edit" onclick="CrudForm.editModalForm(\'' + options.crudForm.formName + '\', \'' + item._id + '\');"><span class="glyphicon glyphicon-pencil"></span></button> ';
                    if (options.allowRemove) html += '<button type="button" class="btn btn-danger btn-xs btn-remove" onclick="CrudForm.confirmRemove(\'' + options.crudForm.formName + '\', \'' + item._id + '\');"><span class="glyphicon glyphicon-remove"></span></button> ';
                }
                var value = '';
                if (field.name.indexOf('.') > 0) {
                    var fieldnames = field.name.split('.', 2);
                    value = item[fieldnames[0]][fieldnames[1]];
                } else {
                    value = item[field.name];
                }
                if (options.rowCallback) {
                    value = options.rowCallback(item, field, value);
                }
                html += value + '</td>';
            }
            html += '</tr>';
        }
        html += '</table>';
        return new Handlebars.SafeString(html);
    });

    // Creates a Modal with the given form template inside
    // crudForm: The CrudForm object
    Handlebars.registerHelper('crudModal', function(crudForm) {
        if (!crudForm) return;
        var html = crudForm.renderModalForm();
        return new Handlebars.SafeString(html);
    });

    // Creates a form and handles submission (insert only, cannot edit existing docs)
    // crudForm: The CrudForm object
    Handlebars.registerHelper('crudForm', function(crudForm) {
        if (!crudForm) return;
        var html = crudForm.renderForm();
        return new Handlebars.SafeString(html);
    });

    // Sets the page title
    // title: The text to use for the page title
    Handlebars.registerHelper('title', function(title) {
        if (title) {
            document.title = title;
        }
    });
}
