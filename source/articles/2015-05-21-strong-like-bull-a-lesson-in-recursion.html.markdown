---
title: Strong-like-bull - A Lesson in Recursion
tags: code
comments: true
---

### &tl;dr;

I’ve created a new gem called [StrongLikeBull](https://github.com/hunterae/strong_like_bull) that suggests what parameters to permit in your strong parameters configuration based on what request parameters a controller action receives.

After repeating the same task multiple times in a row, I start looking for shortcuts. The problem I was facing was how to configure [Strong Parameters](https://github.com/rails/strong_parameters) in our applications as part of a company-wide effort to upgrade to Ruby on Rails 4.2. There were a lot of controllers in the application I was configuring, and this quickly became a very tedious task. For each controller, I was configuring debugger lines in the controller action, examining the request params, and then manually figuring out how what the strong parameters format would look like. Then, given the strong parameter’s required field and permitted params, I could run the strong parameters expression against the request params and make sure I was getting the same output as input.

So after repeating this several times, I began to wonder if there was a better way. A Google search revealed nothing (perhaps I couldn’t figure out what exactly to search for). I also came across a more complex example: some of our api controllers get hit from external services, and we don’t necessarily know what params they are passing. Certainly some auditing was in order, but this also represented another strong case for the use of strong params. Finding no viable solution out there, I began to explore implementing my own. READ_MORE

Because request params can be passed in the form of hashes, arrays, hashes of arrays, and arrays of hashes, and they can be infinitely nested, this seemed like the perfect case for [recursion](http://en.wikipedia.org/wiki/Recursion_(computer_science)). Recursion is usually a fun case study, so I figured I’d break down how I got Rails to automatically make suggestions of permitted params to configure for strong parameters.

### Overview: Divide & Conquer

Given a request to a Rails application, such as to a sessions controller to login to a application, the request parameters will likely be very simple. They might look somethings like this:

```ruby
{user: {email: "test@test.com", password: "password", remember_me: "1" }}
```

With a basic understanding of Strong Parameters, it’s rather trivial to eye these parameters and manually convert them to Strong Parameters format:

```ruby
params.require(:user).permit [:email, :password, :remember_me]
```

What happens though, when your example is thoroughly more complex than this? What happens when you’ve got nested attributes, and they have nested attributes, and the nested attributes might have different fields being specified. How do you dissect a request that looks like this:

```ruby
{"product" => { "name"=>"fake product", "summary"=>"create your fake treats",
                "random_field_1"=>"", "random_field_2"=>"234asfdsfd", "random_field_3"=>"23",
                "random_field_4"=>"1", "random_field_5"=>"0.0",
                "random_field_6"=>"23", "random_field_7"=>"7.5",
                "random_field_8"=>"32323", "random_field_9"=>"2015-04-22",
                "random_field_10"=>"", "random_field_11"=>"",
                "random_field_12"=>"2", "random_field_13"=>"0",
                "random_field_14"=>["", "1", "2", "3"],
                "random_field_15"=>"0", "random_field_16"=>["", "fashion", "home goods"],
                "random_field_17"=>"506", "random_field_18"=>"23",
                "random_field_19"=>{"random_field_20"=>{"random_field_21"=>"", "random_field_22"=>"2"}},
                "random_field_23"=>"1", "random_field_24"=>"1", "random_field_25"=>"1",
                "random_field_26"=>"2fsasd", "random_field_27"=>{"random_field_28"=>"sdfafsd"},
                "random_field_29"=>"2013-02-25 06:00:00", "random_field_30"=>"2013-03-04 12:59:59",
                "random_field_31"=>"1", "random_field_32"=>"fadsfds",
                "random_field_33"=>{"random_field_34"=>"Tim Teseterson", "random_field_35"=>"", "random_field_36"=>"", "random_field_37"=>"1234"},
                "random_field_38"=>"1234", "random_field_39"=>"1", "random_field_40"=>"1", "random_field_41"=>"0",
                "random_field_42"=>"", "random_field_43"=>"",
                "random_field_44"=>{"random_field_45"=>"", "random_field_46"=>"", "random_field_47"=>""}}
```

Into this:

```ruby
params.require(:product).permit [
:name, :summary, :random_field_1, :random_field_2, :random_field_3, :random_field_4, :random_field_5,
:random_field_6, :random_field_7, :random_field_8, :random_field_9, :random_field_10, :random_field_11,
:random_field_12, :random_field_13, {:random_field_14 => []}, :random_field_15, {:random_field_16 => []}, :random_field_17, :random_field_18,
{:random_field_19 => [:random_field_20, :random_field_21, :random_field_22]}, :random_field_23, :random_field_24, :random_field_25,
:random_field_26,
{:random_field_27 => [:random_field_28] }, :random_field_29, :random_field_30, :random_field_31, :random_field_32,
{:random_field_33 => [:random_field_34, :random_field_35, :random_field_36, :random_field_37]},
:random_field_38, :random_field_39, :random_field_40, :random_field_41, :random_field_42,
:random_field_43, {:random_field_44 => [:random_field_45, :random_field_46, :random_field_47]}]
```

Perhaps you’ve had to deal with this kind of example, or maybe a more difficult case. If so, you know the pain and tedium of meticulously converting over request params.

Instead, let’s try and solve this problem using a [divide and conquer](http://www.radford.edu/~nokie/classes/360/divcon.html) strategy. Let’s pull out chunks of the params hash and work on them individually and then combine the results.

### Step 1: Identify the Base Cases

Before we get into nested hashes, or arrays of hashes, or hashes with arrays as values, let’s consider two of the most basic ways params might get passed to your controller: hashes and arrays.

### Hashes:

A login request might receive the following request params:

```ruby
{ user: {email: "test@test.com", password: "password" }}
```

The strong parameters configuration for this request is super simple:

```ruby
params.require(:user).permit([:email, :password])
```

Notice what happened there? The object `{email: “test@test.com”, password: “password”}` changed from a hash to an array, with the elements of the array matching the keys of the hash: `[:email, :password]`. We’ll use this principle as one of the basic cases to handle.

If, then, we are examining a hash, each key of the hash that maps to a non-hash, non-array, will be represented as a symbol in the array. So `{a1: 1, a2: “2”, a3: 2.3}` becomes `[:a1, :a2, :a3]`.

The code for such a block might look something like this:

```ruby
def recursive_suggested_strong_parameters_format(object)
  if object.is_a?(Hash)
    permitted_params = []
    object.each do |key, value|
      if value.is_a?(Hash) || value.is_a?(Array)
        # do something recursive; we'll fill this out below
      else
        permitted_params << :"#{key}"
      end
    end
    permitted_params
  end
end

recursive_suggested_strong_parameters_format(a1: 1, a2: "2", a3: 2.3) # => [:a1, :a2, :a3]
```

### Arrays:

A update request to a Post class might receive the following request params: `{ id: 123, post: { tags: [“code”, “theology”] }}`

The strong parameters configuration for this request is likewise simple:
`params.require(:post).permit({tags: []})`

The piece I want to focus on is that the array of Strings got represented in strong parameter’s world as an empty array: []

This means that if we encounter an array where the elements of the array are non-hashes, non-arrays, we can simply treat this in strong parameters as a []

The code for such a block might look something like this:

```ruby
def recursive_suggested_strong_parameters_format(object)
  if object.is_a?(Hash)
    permitted_params = []
    object.each do |key, value|
      if value.is_a?(Hash) || value.is_a?(Array)
        # do something recursive; we'll fill this out below
      else
        permitted_params << :"#{key}"
      end
    end
    permitted_params
  elsif object.is_a?(Array)
    # it is sufficient to look at the first element of the array to determine if this is an array of hashes of just a array of scalars
    if object.first.is_a?(Hash)
      # do something recursive; we'll fill this out below
    else
      []
    end
  end
end

recursive_suggested_strong_parameters_format ["code", "theology"] # => []
```

Step 2: Identify the Recursion Cases

Now that we have the boundary cases considered, let’s examine how we would handle the non-basic cases: hashes of arrays, arrays of hashes, and hashes of hashes. This is where we will start to see the need for recursion.

### Hashes of Arrays

We actually already saw a recursion example above when we looked at the array example of updating a Post with the request params:

```ruby
{ id: 123, post: { tags: ["code", "theology"] }}
```

In the boundary cases, when we encountered a hash, we simply added the hash key to an array of permitted params. Now, however, we’re dealing with a hash element whose value element is an array. We already saw above how to deal with simple arrays (by returning an empty array []). So we know if we call our recursive_suggested_strong_parameters_format method with [“code”, “theology”], the function will return []. What we need then is for that return value to be set as the value of a new hash. Our expected format would then be: {tags: []} So how do we get there? Let’s update our function so it recursively calls itself:

```ruby
def recursive_suggested_strong_parameters_format(object)
  if object.is_a?(Hash)
    permitted_params = []
    object.each do |key, value|
      if value.is_a?(Hash) || value.is_a?(Array)
        permitted_params << {:"#{key}" => recursive_suggested_strong_parameters_format(value)}
      else
        permitted_params << :"#{key}"
      end
    end
    permitted_params
  elsif object.is_a?(Array)
    # it is sufficient to look at the first element of the array to determine if this is an array of hashes of just a array of scalars
    if object.first.is_a?(Hash)
      # do something recursive; we'll fill this out below
    else
      []
    end
  end
end

recursive_suggested_strong_parameters_format(tags: ["code", "theology"]) # => [{tags: []}]
```

### Arrays of Hashes

Next let’s consider arrays of Hashes, such as the following request, this time, setting the products for a particular object

```ruby
{ products: [{id: 50, name: "Product 1"}, {id: 51, name: "Product 2"}]}
```

Here, we’ve got an array of products, which are each represented by a hash. Our code above is not yet covering this case, but the expected output would be:

```ruby
[{products: [:id, :name]}]
```

So how do we get there then? By combining cases we’ve already handled. We already know how to handle a hash with scalar values. We just saw how to handle a hash with an array as the value. So let’s sub in our missing piece in the code:

```ruby
def recursive_suggested_strong_parameters_format(object)
  if object.is_a?(Hash)
    permitted_params = []
    object.each do |key, value|
      if value.is_a?(Hash) || value.is_a?(Array)
        permitted_params << {:"#{key}" => recursive_suggested_strong_parameters_format(value)}
      else
        permitted_params << :"#{key}"
      end
    end
    permitted_params
  elsif object.is_a?(Array)
    # it is sufficient to look at the first element of the array to determine if this is an array of hashes of just a array of scalars
    if object.first.is_a?(Hash)
      recursive_suggested_strong_parameters_format(object.first)
    else
      []
    end
  end
end

recursive_suggested_strong_parameters_format(products: [{id: 50, name: "Product 1"}, {id: 51, name: "Product 2"}]) # => [{:products=>[:id, :name]}]
```

### Hash of Hashes

By handling previous cases, our code is already setup to handle a hash of hashes of hashes of etc. Let’s try it out:

```ruby
recursive_suggested_strong_parameters_format(product: {product_details: {merchant: {market: {name: "US"}}}})
# => [{:product => [{:product_details => [{:merchant => [{:market => [:name]}]}]}]}]
```

### Step 3: Handle the Edge Cases

I wish I could say we were done there, and the fact of the matter is, this will likely handle most cases out there. But what about Rail’s [`accepts_nested_attributes_for`](http://api.rubyonrails.org/classes/ActiveRecord/NestedAttributes/ClassMethods.html) method and how that passes params? Or how about an array of hashes, where some hashes might include extra keys.

If we run those cases against out code now, we’ll get incorrect results:

```ruby
# HOW accepts_nested_attributes_for SOMETIMES PASSES IN PARAMS:
recursive_suggested_strong_parameters_format products: [{"1" => {name: "Product 1" }, "2" => {name: "Product 2"}}]
# [{:products_attributes=>[{:"1"=>[:name]}, {:"2"=>[:name]}]}]
# WRONG ANSWER, SHOULD BE:
# [{:products=>[:name]}]

# HASHES CONTAIN DIFFERENT KEYS:
recursive_suggested_strong_parameters_format products: [{name: "Product 1" }, {name: "Product 2", description: "Awesome"}]
# [{:products=>[:name]}]
# WRONG ANSWER, SHOULD BE:
# [{:products=>[:name, :description]}]
```

### `accepts_nested_attributes_for` Method of Passing Params

If you’re model accepts nested attributes for a has many relationship, then it passes parameters to your controller action slightly differently. The request parameters might look something more like this:

```ruby
products_attributes: [{"1" => {name: "Product 1" }, "2" => {name: "Product 2"}}]
```

In computing our strong parameters format, we want to completely ignore the IDs “1” and “2” here. To do so, we should examine the first key in a hash and see if it’s an integer. If it is, we should only use the value of the hash and not the key. Our updated code would now look like this:

```ruby
def recursive_suggested_strong_parameters_format(object)
  if object.is_a?(Hash)
    if object.keys.first.match(/^\d+$/)
      recursive_suggested_strong_parameters_format(object.values.first)
    else
      permitted_params = []
      object.each do |key, value|
        if value.is_a?(Hash) || value.is_a?(Array)
          permitted_params << {:"#{key}" => recursive_suggested_strong_parameters_format(value)}
        else
          permitted_params << :"#{key}"
        end
      end
      permitted_params
    end
  elsif object.is_a?(Array)
    # it is sufficient to look at the first element of the array to determine if this is an array of hashes of just a array of scalars
    if object.first.is_a?(Hash)
      recursive_suggested_strong_parameters_format(object.first)
    else
      []
    end
  end
end

recursive_suggested_strong_parameters_format products: [{"1" => {name: "Product 1" }, "2" => {name: "Product 2"}}] # => [{:products=>[:name]}]
```

### Merging Hashes

Almost there. We have one final case to handle. How should we handle an array of hashes where the keys in the hash might differ? For example, suppose our request params look like this:

```ruby
{ products: [{name: "Product 1", summary: "My summary" }, {name: "Product 2", description: "Awesome"}] }
```

What we need is for the array of hashes above to essentially be combined into a single hash that includes all the keys:

```ruby
{ name: "Product 2", summary: "My summary", description: "Awesome" }
```

With this combined hash, we already have the code necessary to handle it. So how do we combine hashes? At first thought, you might be tempted to say [`Hash#merge`](http://ruby-doc.org/core-2.2.0/Hash.html#method-i-merge). And this would certainly handle the above case. But it would not handle the following case:

```ruby
[{name: "Product 1", details: { description: "Awesome" } }, {name: "Product 2", details: { summary: "My summary" }}]
```

We have deep nestings here, so we need to use [`Hash#deep_merge`](http://apidock.com/rails/Hash/deep_merge) (a Hash extension provided by Rails. If we deep_merge the two hashes above, we would get:

```ruby
{name: "Product 2", details: { description: "Awesome", summary: "My summary" }}
```

We also have to account for request parameters in the format:

```ruby
products_attributes: [{"1" => {name: "Product 1" }, "2" => {name: "Product 2"}}]
```

We can handle both of these cases with a few minor tweaks to our function:

```ruby
  def recursive_suggested_strong_parameters_format(object)
    if object.is_a? Hash
      if object.keys.first.match(/^\d+$/)
        hash = {}
        object.values.each do |value|
          hash.deep_merge!(value)
        end
        recursive_suggested_strong_parameters_format(hash)
      else
        permitted_params = []
        object.each do |key, value|
          if value.is_a?(Hash) || value.is_a?(Array)
            permitted_params << {:"#{key}" => recursive_suggested_strong_parameters_format(value)}
          else
            permitted_params << :"#{key}"
          end
        end
        permitted_params
      end
    elsif object.is_a?(Array)
      if object.first.is_a?(Hash)
        hash = {}
        object.each do |value|
          hash.deep_merge!(value)
        end
        recursive_suggested_strong_parameters_format(hash)
      else
        []
      end
    end
  end
```

### Conclusion

There’s really not much else to include other than the fact that recursion can be pretty awesome and can be used to solve a wide-variety of problems fairly succinctly. Obviously, there are refactorings that can be done to the code but I’ll leave that for another day. If there is enough interest in this article, I’ll write another one about how to use recursion to write your own ActiveRecord extension to generate the SQL insert statement for any record or set of records.