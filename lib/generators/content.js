/*
 * content.js: Methods for generating "content" pages, such as blog posts and
 * articles. Also handles directory views if there is no content.
 *
 * (C) 2011, Nodejitsu Inc.
 *
 */

var findit = require('findit'), 
    path   = require('path'),
    hl     = require('../../vendor/highlight/lib/highlight').Highlight,
    markdown = require('github-flavored-markdown'),
    mkdirp = require('mkdirp'),
    fs     = require('fs'),
    fs2 = require('../fs2'),
    docs   = require('../docs'),
    weld   = require('weld').weld,
    helpers = require('../helpers'),
    buildToc = require('../toc').buildToc;

var content = exports;


content.weld = function(dom, pages) {

  // Shortcut to jquery
  var $ = docs.window.$;

  // Shortcut to generated table of contents.
  var toc = docs.content.toc;

  Object.keys(pages).forEach( function (i) {
    var metadata = pages[i].metadata,
        md,
        data;

    // If content exists, parse it with the markdown parser.
    if (pages[i].content) {
      md = markdown.parse(pages[i].content.toString());
    }

    // If there's author metadata, join the authors metadata with the content
    // metadata.
    //
    // docs.content.authors[metadata.author] is an nconf object, and .file.store
    // is a raw object of the configuration data (from file).
    if (metadata && metadata.author) {
      if (docs.content.authors[metadata.author]) {
        metadata.author = docs.content.authors[metadata.author].file.store;
      } else {
        metadata.author = { name: metadata.author };
      }
    }

    // If there's content, use the "article" view.
    if ( (typeof md !== "undefined") && (typeof metadata !== "undefined")) {

      dom.innerHTML = docs.content.theme['./article.html'].toString();

      data = { 
        metadata: metadata, 
        content: md,
        toc: toc
      };

    // If there's no content, use the "directory" view.
    } else {
      dom.innerHTML = docs.content.theme['./directory.html'];

      data = {
        pwd: helpers.unresolve(docs.src, i),
        ls: pages[i].ls || [],
        toc: toc,
        metadata: metadata
      };

      if (typeof data.metadata === "undefined") {
        data.metadata = { breadcrumb: ["."] };
      }

    }

    // Weld the data to the dom.
    weld(dom, data, {
      map: function(parent, element, key, val) {

        // Build a breadcrumb.
        if ($(element).hasClass('breadcrumb')) {
          var crumb = '';

          $('.breadcrumb', parent).each(function(i,v){
            crumb += ('/' + $(v).html());
          });
          crumb += ('/' + val);
          $(element).attr('href', crumb);
          $(element).html(val);

          return false
        }

        // If there is a "ls" element, populate it with a list of files in the
        // directory.
        if ($(element).hasClass("ls")) {

          // The "value" is a path.
          var title = path.basename(val),
              listing;

          // A listing is a row in a table.
          listing = $("<tr>").attr("class", "ls").append(
            $("<td>").append(
              $("<a>").attr("href", val.replace("pages/", "")).text(title)
            )
          );

          $("tr", $(element)).replaceWith(listing);

          return false;
        }

        // Handles cases with the "date" element in the article template.
        // This includes using the "datetime" attribute.
        if ($(element).hasClass("date")) {
          var date = val ? new Date(val).toISOString() : undefined;

          if (date) {
            $(element).attr("datetime", date);
            $(element).text(val);
          }
          return false;
        }

        // If there's author github metadata, link to the author's github acct.
        if ($(element).hasClass("github")) {
          if (val) {
            $(element).append(
              $("<a>")
                .attr("href", "https://github.com/"+val)
                .text("[github]")
            );
          }
          return false;
        }

        // In the case of markdown, we don't want to encode html entities.
        element.innerHTML = val;
        return false;
      }

    });

    // If metadata is missing, we need to clean the elements from the dom that
    // were intended to display that information.
    if (metadata && typeof metadata.title === "undefined") {
      $("#metadata .title", dom).remove();
    };
    if (metadata && typeof metadata.date === "undefined") {
      $("#metadata .date", dom).parent().parent().parent().remove();
    };

    // Give the page a title.
    if (metadata && metadata.title) {
      $('title', dom).html('node docs'
        + ' :: ' + metadata.title
      );
    }

    // Add some meta tags. These are populated from a global config as well as
    // content metadata.
    $('meta[name=keywords]', dom).attr('content', 
      (metadata && metadata.tags || [])
        .concat(docs.config.get("tags") || []).join(',')
    );

    // Performs code highlighting, converting only inside <code> blocks.
    //
    // Note: The hilighter tries to hilight "&gt;" as
    //
    //     `&amp;<span class="identifier">gt</span>;`
    //
    // There are probably a few other html identities that also get incorrectly
    // highlighted (such as &lt;).
    // The easiest way to fix this, besides using a different highlighter,
    // turns out to be running a greedy search/replace for the
    // bungled highlight.
    dom.innerHTML = hl(dom.innerHTML, false, true)
      .replace( new RegExp("&amp;<span class=\"identifier\">gt</span>;",
                "g"), "&gt;");

    // After welding, pull the html back out of the dom.
    pages[i].content = dom.innerHTML;

  });

  return dom;

};

content.generate = function(output, pages) {

  // Write all the welded pages to disk.
  Object.keys(pages).forEach(function(file){
    var newPath = file.replace(path.resolve(docs.src), path.resolve(docs.dst));

    newPath =  path.normalize(newPath + '/index.html');
    fs2.writeFile(newPath, pages[file].content, function(){});
  });

  return pages;
};



// Load all content with an fs2.readDirSync.
content.load = function () {
  if (!docs.src) {
    docs.src = "../../pages";
  }
  
  // Load all the contents.
  // Pages is a hash with key/value pairs of the form `{ "path": "content" }`.
  var pages = fs2.readDirSync(docs.src, true);

  // Combine content and metadata pages to generate key/value pairs that are 1:1
  // with generated content pages.
  pages = helpers.dirToContent(docs.src, pages, true);

  return pages;
  
};
