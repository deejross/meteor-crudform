meteor-crudform
===============

Author: Ross Peoples (deejross)
Email: ross.peoples@gmail.com

BETA
----
This is a newly-released package that was built for a single project, then turned into its own package. There are some things that might not work properly.


Introduction
------------
This package provides client and server-side validation, CRUD forms, document listing in tables with create, edit, and delete buttons. Forms show in Bootstrap 3 modals by default.


Requirements
------------
- Bootstrap 3
- jQuery
- jQuery UI Sortable (for reordering list fields)
- collection-hooks


Collection Schema
-----------------
Collections that need forms will have to be wrapped and fields defined. This can be done in two ways:

- Create the Meteor.Collection yourself, then pass it as a parameter to CrudForm
- Pass the name you want to give the collection to CrudForm and the Collection object is created for you

Example usage:

    Stations = new CrudForm('stations', {
        fields: {
            name: {
                max: 50
            }
        }
    });
    

CrudForm Options
----------------
- fields: Object of field names and their validation settings (more detail in next section)
- label: The label for this collection
- handleAllow: Automatically call Collection.allow for insert, update, and delete (default: true)
- disableServerValidation: don't do form validation on server-side (default: false)
- propeties: Object of fields to be calculated when document is fetched. Value is a function(doc).
- beforeSubmit(action, doc, modifier, editId): client-side hook when a form is submitted. Return false to cancel.
- afterSubmit(action, doc, modifier, editId): client-side hook after beforeSubmit is called
- beforeInsert(userId, doc): client and server-side hook on document insert. Document can be modified. Return false to cancel.
- afterInsert(userId, doc): client and server-side hook after document insert.
- beforeUpdate(userId, doc, modifier, fields): client and server-side hook on update. Modifier can be modifier. Return false to cancel.
- afterUpdate(userId, doc, modifier, fields): client and server-side hook after document update.
- beforeRemote(userId, doc): client and server-side hook on remove. Return false to cancel.
- afterRemove(userId, doc): client and server-side hook after document removal.


CrudForm Validation Options
---------------------------
- type: a string that matches a typeof() call that the value should match (default 'string')
- required: is this field required (boolean, default true)
- default: the default value when showing the new document form
- hidden: do not include this field in forms (default: false)
- widget: the HTML type attribute (default: 'text')
- placeholder: The HTML placeholder attribute
- min: the minimum value if a number, or minimum length if a string
- max: the maximum value if a number, or maximum length if a string
- numberStep: when using the 'number' type and the 'number' widget, this is the HTML step attribute (default: 1)
- regEx: regex string for validation
- regExMessage: if regex validation fails, this string is shown
- customValidation(field, value, doc, modifier): a function that should return [value, error_string]


Template Helpers
----------------

### {{crudList options}}
This displays a list of documents and provides new, edit, and remove buttons. New and edit forms are displayed in a modal.

#### Options:
- crudForm: the CrudForm object
- fields: list of field names to display in table
- selector: list of selectors. Example: [{name: 'test'}, {sort: {name: 1}}]
- allowNew: allow new documents to be created
- allowEdit: allow documents to be updated
- allowRemove: allow documents to be removed
- rowCallback(doc, field, value): to custom render values in the table


### {{crudModal obj}}
Adds a modal to the template that can be shown using the given CrudForm obj (shows 'new' form only)

### {{crudForm obj}}
Displays a form using the given CrudForm obj (shows 'new' form only)


Examples
--------

### Sign Up Form
This is an example sign up form that calls a Meteor method after insert in order to send an enrollement email to the new user. NOTE: the Modal.alert function in the example below references a custom modals package that has not yet been released.

    Signups = new CrudForm('signups', {
        fields: {
            organizationName: {
                label: 'Your Organization\'s Name',
                max: 100
            },
            zipcode: {
                label: 'Zipcode for Organization'
            },
            name: {
                label: 'Your Full Name',
                max: 50
            },
            email: {
                label: 'Your Email Address',
                regEx: /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                regExMessage: 'This is not a valid email address',
                widget: 'email'
            },
            username: {
                max: 50
            },
            password: {
                min: 8,
                widget: 'password'
            }
        },
        afterSubmit: function(action, doc, modifier, editId) {
            $('button[type=submit]').attr('disabled', 'disabled').text('Please wait...');
        },
        beforeInsert: function(userId, doc) {
            doc.username = doc.username.toLowerCase();
            doc.shortname = doc.shortname.toUpperCase();
            doc.created = new Date();
        },
        afterInsert: function(userId, doc) {
            if (Meteor.isClient) {
                Meteor.call('createOrganizationFromSignup', doc, function(err, result) {
                    if (err) {
                        $('button[type=submit]').removeAttr('disabled').text('Submit');
                        Modal.alert(err);
                    } else {
                        Modal.alert('Thank you for signing up. You will receive an email in a few minutes with instructions on how to log in to your account.', {title: 'Sign Up Successful', buttonClass: 'btn-success', callback: function() {
                            Router.go('/');
                        }});
                    }
                });
            }
        }
    });
    
This is placed in the Sign Up template:

    {{crudForm form}}
    
And this is the template helper:

    Template.signUpForm.helpers({
        form: function() {
            return Signups;
        }
    });
    
To view all the signups in another template (like an administrative interface), this is the template tag:

    {{crudList options}}
    
This would be the helper:

    Template.viewSignUps.helpers({
        options: function() {
            return {
                crudForm: Signups,
                fields: ['name', 'email', 'organizationName'],
                selector: [{}, {sort: {name: 1}}]
            };
        }
    });
